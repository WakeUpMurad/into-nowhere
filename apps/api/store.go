package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type order struct {
	ID                  string `json:"id"`
	ReadToken           string `json:"readToken"`
	IdempotencyKey      string `json:"idempotencyKey"`
	AmountMinor         string `json:"amountMinor"`
	Currency            string `json:"currency"`
	Intention           string `json:"intention"`
	Locale              string `json:"locale"`
	CharityQuarterMinor string `json:"charityQuarterMinor"`
	Status              string `json:"status"`
	Transaction         string `json:"transaction,omitempty"`
	CheckoutURL         string `json:"checkoutUrl,omitempty"`
	// CreateAttempted prevents automatic duplicate provider requests after a
	// crash or an ambiguous network error. Provider reconciliation comes first.
	CreateAttempted bool   `json:"createAttempted"`
	CreatedAt       string `json:"createdAt"`
	ConfirmedAt     string `json:"confirmedAt,omitempty"`
}

type ledger struct {
	Version int              `json:"version"`
	Orders  map[string]order `json:"orders"`
}

var errUnchanged = errors.New("payment data unchanged")

// orderStore is deliberately a single-process durable store. A filesystem lock
// refuses a second process, and each change is written by fsync + atomic rename.
// Hosts must mount a persistent disk; an ephemeral filesystem is not suitable.
type orderStore struct {
	mu     sync.Mutex
	path   string
	lock   *os.File
	data   ledger
	closed bool
}

func openOrderStore(path string) (*orderStore, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, errors.New("cannot create payment data directory")
	}
	lock, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, errors.New("cannot open payment data lock")
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = lock.Close()
		return nil, errors.New("payment data is already in use by another process")
	}
	s := &orderStore{path: path, lock: lock, data: ledger{Version: 1, Orders: map[string]order{}}}
	file, err := os.Open(path)
	if err == nil {
		decoder := json.NewDecoder(io.LimitReader(file, 64<<20))
		err = decoder.Decode(&s.data)
		if err == nil && decoder.Decode(new(any)) != io.EOF {
			err = errors.New("invalid trailing data")
		}
		_ = file.Close()
		if err != nil || s.data.Version != 1 || s.data.Orders == nil {
			_ = s.Close()
			return nil, errors.New("payment data is invalid; refusing to replace it")
		}
		seen := make(map[string]bool)
		for id, entry := range s.data.Orders {
			if id != entry.ID || entry.ReadToken == "" || entry.IdempotencyKey == "" || seen[entry.IdempotencyKey] || !validPositiveMinor(entry.AmountMinor) || entry.CharityQuarterMinor != entry.AmountMinor || (entry.Currency != "USD" && entry.Currency != "AZN") || !knownOrderStatus(entry.Status) {
				_ = s.Close()
				return nil, errors.New("payment data contains an invalid order")
			}
			seen[entry.IdempotencyKey] = true
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		_ = s.Close()
		return nil, errors.New("cannot read payment data")
	} else if err = s.save(s.data); err != nil {
		_ = s.Close()
		return nil, err
	}
	return s, nil
}

func knownOrderStatus(status string) bool {
	return status == "pending" || status == "paid" || status == "failed" || status == "refunded"
}

func (s *orderStore) save(data ledger) error {
	file, err := os.CreateTemp(filepath.Dir(s.path), ".payment-ledger-*")
	if err != nil {
		return errors.New("cannot write payment data")
	}
	name := file.Name()
	defer os.Remove(name)
	if err = file.Chmod(0600); err == nil {
		err = json.NewEncoder(file).Encode(data)
	}
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(name, s.path)
	}
	if err != nil {
		return errors.New("cannot persist payment data")
	}
	directory, err := os.Open(filepath.Dir(s.path))
	if err != nil {
		return errors.New("cannot sync payment data directory")
	}
	err = directory.Sync()
	_ = directory.Close()
	if err != nil {
		return errors.New("cannot sync payment data directory")
	}
	return nil
}

func (s *orderStore) change(update func(*ledger) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return errors.New("payment store is closed")
	}
	next := ledger{Version: s.data.Version, Orders: make(map[string]order, len(s.data.Orders))}
	for id, entry := range s.data.Orders {
		next.Orders[id] = entry
	}
	if err := update(&next); err != nil {
		if errors.Is(err, errUnchanged) {
			return nil
		}
		return err
	}
	if err := s.save(next); err != nil {
		return err
	}
	s.data = next
	return nil
}

func (s *orderStore) get(id string) (order, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, exists := s.data.Orders[id]
	return entry, exists
}

func (s *orderStore) byKey(key string) (order, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, entry := range s.data.Orders {
		if entry.IdempotencyKey == key {
			return entry, true
		}
	}
	return order{}, false
}

func (s *orderStore) confirm(id, transaction, status string) error {
	return s.change(func(data *ledger) error {
		entry, exists := data.Orders[id]
		if !exists {
			return errors.New("order not found")
		}
		if entry.Transaction != "" && entry.Transaction != transaction {
			return errors.New("transaction does not match order")
		}
		for otherID, other := range data.Orders {
			if otherID != id && other.Transaction == transaction && transaction != "" {
				return errors.New("transaction is already assigned")
			}
		}
		previousTransaction := entry.Transaction
		entry.Transaction = transaction
		// Late failure notifications cannot undo a confirmed payment. Refunds
		// are a distinct future reconciled operation, never an assumed failure.
		if entry.Status == "refunded" || (entry.Status == "paid" && status != "refunded") || (entry.Status == status && previousTransaction == transaction) {
			return errUnchanged
		}
		if status == "paid" || status == "failed" || status == "refunded" {
			entry.Status = status
			if status == "paid" {
				entry.ConfirmedAt = time.Now().UTC().Format(time.RFC3339Nano)
			}
		}
		data.Orders[id] = entry
		return nil
	})
}

func (s *orderStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	if err := syscall.Flock(int(s.lock.Fd()), syscall.LOCK_UN); err != nil {
		return fmt.Errorf("release payment data lock: %w", err)
	}
	return s.lock.Close()
}

func validReadToken(actual, supplied string) bool {
	return len(actual) == len(supplied) && subtle.ConstantTimeCompare([]byte(actual), []byte(supplied)) == 1
}
