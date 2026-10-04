package api

import (
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"strings"
)

const maxRequestBytes = 4096

type serviceConfig struct {
	Mode                string   `json:"mode"`
	Currency            string   `json:"currency"`
	MinAmountMinor      int      `json:"minAmountMinor"`
	PaymentsEnabled     bool     `json:"paymentsEnabled"`
	PaymentMethods      []string `json:"paymentMethods"`
	CharitySharePercent int      `json:"charitySharePercent"`
}

type paymentRequest struct {
	AmountMinor string `json:"amountMinor"`
	Currency    string `json:"currency"`
	Intention   string `json:"intention"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewHandler returns the demo API. Real payment methods are deliberately absent.
func NewHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		switch r.URL.Path {
		case "/api/health":
			if !requireMethod(w, r, http.MethodGet) {
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		case "/api/config":
			if !requireMethod(w, r, http.MethodGet) {
				return
			}
			writeJSON(w, http.StatusOK, serviceConfig{
				Mode: "demo", Currency: "USD", MinAmountMinor: 100,
				PaymentsEnabled: false, PaymentMethods: []string{}, CharitySharePercent: 25,
			})
		case "/api/payments/create":
			if !requireMethod(w, r, http.MethodPost) {
				return
			}
			createPayment(w, r)
		default:
			writeError(w, http.StatusNotFound, "NOT_FOUND", "Endpoint not found.")
		}
	})
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "This HTTP method is not supported.")
	return false
}

func createPayment(w http.ResponseWriter, r *http.Request) {
	// This endpoint validates the future checkout contract but creates no order,
	// financial entry, payment session, or successful payment in demo mode.
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request paymentRequest
	if err := decoder.Decode(&request); err != nil {
		writeDecodeError(w, err)
		return
	}
	// Accept exactly one JSON object, followed only by JSON whitespace.
	if err := decoder.Decode(new(any)); err != io.EOF {
		if err == nil {
			writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Provide exactly one JSON object.")
		} else {
			writeDecodeError(w, err)
		}
		return
	}
	if !validAmount(request.AmountMinor) {
		writeError(w, http.StatusBadRequest, "INVALID_AMOUNT", "amountMinor must contain 1 to 30 decimal digits, without leading zeros, and be at least 100 cents.")
		return
	}
	if request.Currency != "USD" {
		writeError(w, http.StatusBadRequest, "INVALID_CURRENCY", "Only USD is supported by this checkout contract.")
		return
	}
	switch request.Intention {
	case "wealth", "health", "success", "love", "gratitude":
	default:
		writeError(w, http.StatusBadRequest, "INVALID_INTENTION", "Choose an available intention.")
		return
	}
	writeError(w, http.StatusServiceUnavailable, "PAYMENTS_NOT_CONFIGURED", "Real payments are not connected. No money has been charged.")
}

func validAmount(amount string) bool {
	if len(amount) == 0 || len(amount) > 30 || strings.HasPrefix(amount, "0") {
		return false
	}
	for _, digit := range amount {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	value, ok := new(big.Int).SetString(amount, 10)
	return ok && value.Cmp(big.NewInt(100)) >= 0
}

func writeDecodeError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		writeError(w, http.StatusRequestEntityTooLarge, "REQUEST_TOO_LARGE", "The request body exceeds 4096 bytes.")
		return
	}
	writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "Provide one JSON object with amountMinor, currency, and intention only.")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, apiError{Code: code, Message: message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	// All response values are JSON-compatible constants or typed structs.
	_ = json.NewEncoder(w).Encode(value)
}
