package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Handler struct {
	options     Options
	store       *orderStore
	provider    *epointClient
	checkMu     sync.Mutex
	lastChecked map[string]time.Time
}

func NewConfiguredHandler(options Options) (*Handler, error) {
	h := &Handler{options: options, lastChecked: map[string]time.Time{}}
	if !options.ready() {
		return h, nil
	}
	store, err := openOrderStore(options.DataPath)
	if err != nil {
		return nil, err
	}
	h.store = store
	h.provider = newEpointClient(options)
	return h, nil
}

func (h *Handler) PaymentsEnabled() bool { return h.store != nil && h.provider != nil }
func (h *Handler) Close() error {
	if h.store != nil {
		return h.store.Close()
	}
	return nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	if h.PaymentsEnabled() && r.Header.Get("Origin") != "" {
		base, _ := url.Parse(h.options.PublicBaseURL)
		origin := base.Scheme + "://" + base.Host
		if r.Header.Get("Origin") != origin && r.URL.Path != "/api/payments/epoint/callback" {
			writeError(w, http.StatusForbidden, "ORIGIN_NOT_ALLOWED", "This origin is not allowed.")
			return
		}
		if r.Header.Get("Origin") == origin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
	}
	switch r.URL.Path {
	case "/api/health":
		if requireMethod(w, r, http.MethodGet) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		}
	case "/api/config":
		if !requireMethod(w, r, http.MethodGet) {
			return
		}
		config := serviceConfig{Mode: "demo", Currency: "USD", MinAmountMinor: 100, PaymentsEnabled: false, PaymentMethods: []string{}, CharitySharePercent: 25}
		if h.PaymentsEnabled() {
			minimum, _ := strconv.ParseInt(h.options.MinAmountMinor, 10, 64)
			maximum := h.options.MaxAmountMinor
			config = serviceConfig{Mode: "live", Currency: h.options.Currency, MinAmountMinor: int(minimum), MaxAmountMinor: &maximum,
				PaymentsEnabled: true, PaymentMethods: []string{"card"}, CharitySharePercent: 25,
				MerchantName: h.options.MerchantName, SupportEmail: h.options.SupportEmail, Provider: "epoint"}
		}
		writeJSON(w, http.StatusOK, config)
	case "/api/payments/create":
		if !requireMethod(w, r, http.MethodPost) {
			return
		}
		if h.PaymentsEnabled() {
			h.create(w, r)
		} else {
			createPayment(w, r)
		}
	case "/api/payments/epoint/callback":
		if !h.PaymentsEnabled() {
			writeError(w, 404, "NOT_FOUND", "Endpoint not found.")
			return
		}
		if requireMethod(w, r, http.MethodPost) {
			h.callback(w, r)
		}
	default:
		if h.PaymentsEnabled() && strings.HasPrefix(r.URL.Path, "/api/payments/") {
			if requireMethod(w, r, http.MethodGet) {
				h.receipt(w, r)
			}
			return
		}
		writeError(w, 404, "NOT_FOUND", "Endpoint not found.")
	}
}

type paymentReceipt struct {
	OrderID             string  `json:"orderId"`
	ReadToken           string  `json:"readToken,omitempty"`
	CheckoutURL         *string `json:"checkoutUrl"`
	Status              string  `json:"status"`
	AmountMinor         string  `json:"amountMinor"`
	Currency            string  `json:"currency"`
	CharityQuarterMinor string  `json:"charityQuarterMinor"`
	Confirmation        *string `json:"confirmation"`
}

func receiptFor(entry order, includeToken bool) paymentReceipt {
	result := paymentReceipt{OrderID: entry.ID, Status: entry.Status, AmountMinor: entry.AmountMinor, Currency: entry.Currency, CharityQuarterMinor: entry.CharityQuarterMinor}
	if includeToken {
		result.ReadToken = entry.ReadToken
	}
	if entry.CheckoutURL != "" && entry.Status == "pending" {
		result.CheckoutURL = &entry.CheckoutURL
	}
	if entry.Status == "paid" || entry.Status == "refunded" {
		confirmed := "provider"
		result.Confirmation = &confirmed
	}
	return result
}

func randomID(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", errors.New("cannot generate payment identifier")
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}

func validIdempotencyKey(value string) bool {
	if len(value) == 0 || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') && character != '-' && character != '_' {
			return false
		}
	}
	return true
}

var errIdempotencyConflict = errors.New("idempotency key reused with different request")

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request paymentRequest
	if err := decoder.Decode(&request); err != nil {
		writeDecodeError(w, err)
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		writeError(w, 400, "INVALID_REQUEST", "Provide exactly one JSON object.")
		return
	}
	if !validPositiveMinor(request.AmountMinor) || compareMinor(request.AmountMinor, h.options.MinAmountMinor) < 0 || compareMinor(request.AmountMinor, h.options.MaxAmountMinor) > 0 {
		writeError(w, 400, "INVALID_AMOUNT", "The amount must be within the merchant's approved limits.")
		return
	}
	if request.Currency != h.options.Currency {
		writeError(w, 400, "INVALID_CURRENCY", "Choose the merchant's configured currency.")
		return
	}
	switch request.Intention {
	case "wealth", "health", "success", "love", "gratitude":
	default:
		writeError(w, 400, "INVALID_INTENTION", "Choose an available intention.")
		return
	}
	if request.Locale == "" {
		request.Locale = "en"
	}
	if request.Locale != "en" && request.Locale != "az" && request.Locale != "ru" {
		writeError(w, 400, "INVALID_LOCALE", "Choose an available language.")
		return
	}
	key := r.Header.Get("Idempotency-Key")
	if !validIdempotencyKey(key) {
		writeError(w, 400, "INVALID_IDEMPOTENCY_KEY", "Provide an Idempotency-Key of 1 to 128 letters, digits, hyphens or underscores.")
		return
	}
	id, err := randomID(18)
	if err != nil {
		writeError(w, 503, "PAYMENT_UNAVAILABLE", "Cannot prepare checkout.")
		return
	}
	token, err := randomID(32)
	if err != nil {
		writeError(w, 503, "PAYMENT_UNAVAILABLE", "Cannot prepare checkout.")
		return
	}
	entry := order{ID: id, ReadToken: token, IdempotencyKey: key, AmountMinor: request.AmountMinor, Currency: request.Currency, Intention: request.Intention, Locale: request.Locale,
		CharityQuarterMinor: request.AmountMinor, Status: "pending", CreateAttempted: true, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	created := false
	err = h.store.change(func(data *ledger) error {
		for _, existing := range data.Orders {
			if existing.IdempotencyKey != key {
				continue
			}
			if existing.AmountMinor != request.AmountMinor || existing.Currency != request.Currency || existing.Intention != request.Intention || existing.Locale != request.Locale {
				return errIdempotencyConflict
			}
			entry = existing
			return errUnchanged
		}
		data.Orders[entry.ID] = entry
		created = true
		return nil
	})
	if errors.Is(err, errIdempotencyConflict) {
		writeError(w, 409, "IDEMPOTENCY_CONFLICT", "This key was already used for a different checkout.")
		return
	}
	if err != nil {
		writeError(w, 503, "PAYMENT_STORAGE_UNAVAILABLE", "Cannot persist checkout. No provider request was made.")
		return
	}
	if !created {
		status := http.StatusOK
		if entry.Status == "pending" && entry.CheckoutURL == "" {
			status = http.StatusAccepted
		}
		writeJSON(w, status, receiptFor(entry, true))
		return
	}
	base, _ := url.Parse(h.options.PublicBaseURL)
	base.Fragment = "payment=" + entry.ID + "&token=" + entry.ReadToken
	providerResult, err := h.provider.create(r.Context(), entry, base.String())
	if err != nil {
		// The remote server may have accepted the request. Never retry it
		// automatically or turn a network error into a claimed failed charge.
		writeJSON(w, http.StatusAccepted, receiptFor(entry, true))
		return
	}
	if providerResult.Status != "success" || providerResult.Transaction == "" {
		if providerResult.Status == "error" {
			_ = h.store.change(func(data *ledger) error {
				current := data.Orders[entry.ID]
				if current.Status == "pending" {
					current.Status = "failed"
					data.Orders[entry.ID] = current
				}
				return nil
			})
			entry, _ = h.store.get(entry.ID)
		}
		writeJSON(w, http.StatusAccepted, receiptFor(entry, true))
		return
	}
	err = h.store.change(func(data *ledger) error {
		current := data.Orders[entry.ID]
		if current.Transaction != "" && current.Transaction != providerResult.Transaction {
			return errors.New("provider transaction mismatch")
		}
		for otherID, other := range data.Orders {
			if otherID != entry.ID && other.Transaction == providerResult.Transaction {
				return errors.New("provider transaction already assigned")
			}
		}
		current.Transaction = providerResult.Transaction
		if trustedEpointCheckout(providerResult.RedirectURL) {
			current.CheckoutURL = providerResult.RedirectURL
		}
		data.Orders[entry.ID] = current
		return nil
	})
	if err != nil {
		writeError(w, 503, "PAYMENT_STORAGE_UNAVAILABLE", "Checkout could not be persisted. Do not retry with a different key.")
		return
	}
	entry, _ = h.store.get(entry.ID)
	status := http.StatusCreated
	if entry.CheckoutURL == "" {
		status = http.StatusAccepted
	}
	writeJSON(w, status, receiptFor(entry, true))
}

func (h *Handler) receipt(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/payments/")
	entry, exists := h.store.get(id)
	supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !exists || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") || !validReadToken(entry.ReadToken, supplied) {
		writeError(w, 404, "PAYMENT_NOT_FOUND", "Payment receipt not found.")
		return
	}
	if entry.Transaction != "" && entry.Status != "refunded" && h.shouldCheck(entry.ID) {
		if err := h.reconcile(r, entry, entry.Transaction); err == nil {
			entry, _ = h.store.get(id)
		}
	}
	writeJSON(w, 200, receiptFor(entry, false))
}

func (h *Handler) shouldCheck(id string) bool {
	h.checkMu.Lock()
	defer h.checkMu.Unlock()
	if time.Since(h.lastChecked[id]) < 5*time.Second {
		return false
	}
	h.lastChecked[id] = time.Now()
	return true
}

func (h *Handler) reconcile(r *http.Request, entry order, transaction string) error {
	result, err := h.provider.status(r.Context(), transaction)
	if err != nil {
		return err
	}
	// A transaction received from a signed callback still has to match the
	// authenticated provider status response and the stored monetary amount.
	if result.Transaction != transaction || !providerPaymentMatches(result, entry) {
		return errors.New("provider status does not match the order")
	}
	return h.store.confirm(entry.ID, transaction, verifiedProviderStatus(result.Status))
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	if err := r.ParseForm(); err != nil {
		writeError(w, 400, "INVALID_CALLBACK", "Invalid provider callback.")
		return
	}
	if len(r.PostForm["data"]) != 1 || len(r.PostForm["signature"]) != 1 {
		writeError(w, 400, "INVALID_CALLBACK", "Provide one data and signature value.")
		return
	}
	data, signature := r.PostForm.Get("data"), r.PostForm.Get("signature")
	if !validEpointSignature(h.options.PrivateKey, data, signature) {
		writeError(w, 401, "INVALID_SIGNATURE", "Invalid provider signature.")
		return
	}
	result, err := decodeProviderPayment(data)
	if err != nil {
		writeError(w, 400, "INVALID_CALLBACK", "Invalid provider callback.")
		return
	}
	entry, exists := h.store.get(result.OrderID)
	if !exists || result.OrderID == "" || !providerPaymentMatches(result, entry) {
		writeError(w, 409, "PAYMENT_MISMATCH", "Callback does not match an order.")
		return
	}
	if err := h.reconcile(r, entry, result.Transaction); err != nil {
		writeError(w, 502, "CONFIRMATION_UNAVAILABLE", "Provider confirmation is unavailable or does not match. Retry this callback.")
		return
	}
	updated, _ := h.store.get(entry.ID)
	writeJSON(w, 200, map[string]any{"received": true, "status": updated.Status})
}
