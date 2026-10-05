package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

type testTransport func(*http.Request) (*http.Response, error)

func (fn testTransport) RoundTrip(request *http.Request) (*http.Response, error) { return fn(request) }

func providerResponse(value any) (*http.Response, error) {
	encoded, _ := json.Marshal(value)
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(string(encoded))), Header: make(http.Header)}, nil
}

func merchantOptions(path string) Options {
	return Options{PublicKey: "test-public", PrivateKey: "test-private", MerchantApproved: true, CurrencyApproved: true,
		Currency: "USD", MinAmountMinor: "100", MaxAmountMinor: "10000000", PublicBaseURL: "https://release.example/",
		MerchantName: "Test merchant", SupportEmail: "support@release.example", DataPath: path}
}

func testConfiguredHandler(t *testing.T) *Handler {
	t.Helper()
	h, err := NewConfiguredHandler(merchantOptions(filepath.Join(t.TempDir(), "ledger.json")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h
}

func servePayment(h http.Handler, method, path, body, key, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if key != "" {
		r.Header.Set("Idempotency-Key", key)
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func createTestOrder(t *testing.T, h *Handler, key string) paymentReceipt {
	t.Helper()
	w := servePayment(h, http.MethodPost, "/api/payments/create", `{"amountMinor":"101","currency":"USD","intention":"gratitude","locale":"en"}`, key, "")
	if w.Code != 201 && w.Code != 202 && w.Code != 200 {
		t.Fatalf("create status %d: %s", w.Code, w.Body.String())
	}
	var receipt paymentReceipt
	if err := json.Unmarshal(w.Body.Bytes(), &receipt); err != nil {
		t.Fatal(err)
	}
	return receipt
}

func testCreateResponse() map[string]any {
	return map[string]any{"status": "success", "transaction": "tw1", "redirect_url": "https://epoint.az/api/1/checkout/tw1"}
}

func statusResponse(status string) map[string]any {
	return map[string]any{"status": status, "transaction": "tw1", "amount": "1.01", "operation_code": "100"}
}

func sendCallback(h *Handler, payload map[string]any, validSignature bool) *httptest.ResponseRecorder {
	encoded, _ := json.Marshal(payload)
	data := base64.StdEncoding.EncodeToString(encoded)
	signature := epointSignature(h.options.PrivateKey, data)
	if !validSignature {
		signature = "invalid"
	}
	r := httptest.NewRequest(http.MethodPost, "/api/payments/epoint/callback", strings.NewReader(url.Values{"data": {data}, "signature": {signature}}.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestPartialMerchantSettingsRemainDemo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "never-created.json")
	valid := merchantOptions(path)
	for _, mutate := range []func(*Options){
		func(o *Options) { o.PublicKey = "" }, func(o *Options) { o.PrivateKey = "" }, func(o *Options) { o.MerchantApproved = false },
		func(o *Options) { o.CurrencyApproved = false }, func(o *Options) { o.MinAmountMinor = "" }, func(o *Options) { o.MaxAmountMinor = "" },
		func(o *Options) { o.PublicBaseURL = "http://release.example" }, func(o *Options) { o.SupportEmail = "" }, func(o *Options) { o.MerchantName = "" },
	} {
		options := valid
		mutate(&options)
		h, err := NewConfiguredHandler(options)
		if err != nil || h.PaymentsEnabled() || h.store != nil || h.provider != nil {
			t.Fatal("incomplete settings enabled checkout")
		}
		w := servePayment(h, http.MethodPost, "/api/payments/create", `{"amountMinor":"101","currency":"USD","intention":"love"}`, "key", "")
		assertError(t, w, 503, "PAYMENTS_NOT_CONFIGURED")
		if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("demo created payment data")
		}
	}
}

func TestCheckoutIsPendingAndIdempotent(t *testing.T) {
	h := testConfiguredHandler(t)
	var calls atomic.Int32
	h.provider.client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		if r.URL.String() != epointAPIBase+"request" {
			t.Fatalf("unexpected provider endpoint %s", r.URL)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if !validEpointSignature(h.options.PrivateKey, r.PostForm.Get("data"), r.PostForm.Get("signature")) {
			t.Fatal("request signature invalid")
		}
		decoded, _ := base64.StdEncoding.DecodeString(r.PostForm.Get("data"))
		var payload map[string]json.RawMessage
		if err := json.Unmarshal(decoded, &payload); err != nil {
			t.Fatal(err)
		}
		if string(payload["amount"]) != "1.01" {
			t.Fatal("amount lost precision")
		}
		var success, errorURL string
		_ = json.Unmarshal(payload["success_redirect_url"], &success)
		_ = json.Unmarshal(payload["error_redirect_url"], &errorURL)
		if success != errorURL || !strings.HasPrefix(success, "https://release.example/#payment=") || !strings.Contains(success, "&token=") {
			t.Fatal("unsafe return URL")
		}
		return providerResponse(testCreateResponse())
	})
	first := createTestOrder(t, h, "same-key")
	second := createTestOrder(t, h, "same-key")
	if calls.Load() != 1 || first.OrderID != second.OrderID || first.ReadToken != second.ReadToken {
		t.Fatal("idempotent create repeated provider request")
	}
	if first.Status != "pending" || first.Confirmation != nil || first.CharityQuarterMinor != "101" {
		t.Fatalf("incorrect initial receipt: %+v", first)
	}
	if first.CheckoutURL == nil || !trustedEpointCheckout(*first.CheckoutURL) {
		t.Fatal("missing trusted checkout")
	}
	changed := servePayment(h, http.MethodPost, "/api/payments/create", `{"amountMinor":"102","currency":"USD","intention":"gratitude","locale":"en"}`, "same-key", "")
	assertError(t, changed, 409, "IDEMPOTENCY_CONFLICT")
	if calls.Load() != 1 {
		t.Fatal("conflict called provider")
	}
	forged := servePayment(h, http.MethodGet, "/api/payments/"+first.OrderID+"?status=success&paid=true", "", "", "")
	assertError(t, forged, 404, "PAYMENT_NOT_FOUND")
	entry, _ := h.store.get(first.OrderID)
	if entry.Status != "pending" {
		t.Fatal("browser return was treated as payment")
	}
}

func TestAmbiguousCreateDoesNotRetryProvider(t *testing.T) {
	h := testConfiguredHandler(t)
	var calls atomic.Int32
	h.provider.client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return nil, errors.New("network interrupted")
	})
	first := createTestOrder(t, h, "ambiguous")
	second := createTestOrder(t, h, "ambiguous")
	if calls.Load() != 1 || first.Status != "pending" || first.OrderID != second.OrderID || first.CheckoutURL != nil {
		t.Fatal("ambiguous request retried or falsely failed")
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewConfiguredHandler(h.options)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	restarted.provider.client.Transport = h.provider.client.Transport
	third := createTestOrder(t, restarted, "ambiguous")
	if third.OrderID != first.OrderID || calls.Load() != 1 {
		t.Fatal("restart duplicated ambiguous provider request")
	}
}

func TestConcurrentCreatesCallProviderOnce(t *testing.T) {
	h := testConfiguredHandler(t)
	var calls atomic.Int32
	h.provider.client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return providerResponse(testCreateResponse())
	})
	var group sync.WaitGroup
	for i := 0; i < 8; i++ {
		group.Add(1)
		go func() { defer group.Done(); createTestOrder(t, h, "concurrent") }()
	}
	group.Wait()
	if calls.Load() != 1 || len(h.store.data.Orders) != 1 {
		t.Fatal("concurrent creates duplicated an order")
	}
}

func TestSignedCallbacksAndAuthenticatedStatus(t *testing.T) {
	h := testConfiguredHandler(t)
	var statusCalls atomic.Int32
	currentStatus := "success"
	h.provider.client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/api/1/request" {
			return providerResponse(testCreateResponse())
		}
		statusCalls.Add(1)
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if !validEpointSignature(h.options.PrivateKey, r.PostForm.Get("data"), r.PostForm.Get("signature")) {
			t.Fatal("status request was not authenticated")
		}
		decoded, _ := base64.StdEncoding.DecodeString(r.PostForm.Get("data"))
		var payload map[string]string
		_ = json.Unmarshal(decoded, &payload)
		if payload["transaction"] != "tw1" || payload["public_key"] != h.options.PublicKey {
			t.Fatal("wrong status request")
		}
		return providerResponse(statusResponse(currentStatus))
	})
	receipt := createTestOrder(t, h, "callback-order")
	payload := statusResponse("success")
	payload["order_id"] = receipt.OrderID
	bad := sendCallback(h, payload, false)
	assertError(t, bad, 401, "INVALID_SIGNATURE")
	for _, change := range []func(map[string]any){
		func(p map[string]any) { p["amount"] = "1.02" }, func(p map[string]any) { p["currency"] = "AZN" },
		func(p map[string]any) { p["operation_code"] = "001" }, func(p map[string]any) { p["transaction"] = "other" },
		func(p map[string]any) { p["order_id"] = "unknown" },
	} {
		copy := statusResponse("success")
		copy["order_id"] = receipt.OrderID
		change(copy)
		assertError(t, sendCallback(h, copy, true), 409, "PAYMENT_MISMATCH")
	}
	if statusCalls.Load() != 0 {
		t.Fatal("invalid callback requested provider status")
	}
	for i := 0; i < 2; i++ {
		if result := sendCallback(h, payload, true); result.Code != 200 {
			t.Fatalf("callback failed %d %s", result.Code, result.Body.String())
		}
	}
	entry, _ := h.store.get(receipt.OrderID)
	if entry.Status != "paid" || entry.ConfirmedAt == "" || entry.CharityQuarterMinor != "101" || len(h.store.data.Orders) != 1 {
		t.Fatal("verified callback did not produce one exact receipt")
	}
	confirmedAt := entry.ConfirmedAt
	currentStatus = "failed"
	if w := sendCallback(h, payload, true); w.Code != 200 {
		t.Fatal("late callback failed")
	}
	entry, _ = h.store.get(receipt.OrderID)
	if entry.Status != "paid" || entry.ConfirmedAt != confirmedAt {
		t.Fatal("late failure undid confirmed payment")
	}
	currentStatus = "returned"
	if w := sendCallback(h, payload, true); w.Code != 200 {
		t.Fatal("refund confirmation failed")
	}
	entry, _ = h.store.get(receipt.OrderID)
	if entry.Status != "refunded" {
		t.Fatal("authenticated returned status not recorded")
	}
	currentStatus = "success"
	_ = sendCallback(h, payload, true)
	entry, _ = h.store.get(receipt.OrderID)
	if entry.Status != "refunded" {
		t.Fatal("replay undid refund")
	}
}

func TestMismatchedProviderStatusCannotConfirm(t *testing.T) {
	h := testConfiguredHandler(t)
	h.provider.client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/api/1/request" {
			return providerResponse(testCreateResponse())
		}
		result := statusResponse("success")
		result["amount"] = "1.02"
		return providerResponse(result)
	})
	receipt := createTestOrder(t, h, "status-mismatch")
	payload := statusResponse("success")
	payload["order_id"] = receipt.OrderID
	assertError(t, sendCallback(h, payload, true), 502, "CONFIRMATION_UNAVAILABLE")
	entry, _ := h.store.get(receipt.OrderID)
	if entry.Status != "pending" {
		t.Fatal("mismatched provider amount marked paid")
	}
}

func TestDurableReceiptAndExclusiveStore(t *testing.T) {
	h := testConfiguredHandler(t)
	h.provider.client.Transport = testTransport(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/api/1/request" {
			return providerResponse(testCreateResponse())
		}
		return providerResponse(statusResponse("success"))
	})
	receipt := createTestOrder(t, h, "persisted")
	if _, err := NewConfiguredHandler(h.options); err == nil {
		t.Fatal("second process obtained payment store")
	}
	payload := statusResponse("success")
	payload["order_id"] = receipt.OrderID
	if w := sendCallback(h, payload, true); w.Code != 200 {
		t.Fatal("payment confirmation failed")
	}
	if err := h.Close(); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewConfiguredHandler(h.options)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	restarted.provider.client.Transport = h.provider.client.Transport
	w := servePayment(restarted, http.MethodGet, "/api/payments/"+receipt.OrderID, "", "", receipt.ReadToken)
	if w.Code != 200 {
		t.Fatal("persisted receipt not readable")
	}
	var saved paymentReceipt
	_ = json.Unmarshal(w.Body.Bytes(), &saved)
	if saved.Status != "paid" || saved.ReadToken != "" || saved.Confirmation == nil || saved.CharityQuarterMinor != "101" {
		t.Fatalf("invalid persisted receipt %+v", saved)
	}
}

func TestUntrustedProviderRedirectIsNotExposed(t *testing.T) {
	for _, target := range []string{"http://epoint.az/checkout", "https://epoint.az.evil.example/", "https://epoint.az@evil.example/", "https://epoint.az:444/", "https://evil.example/"} {
		h := testConfiguredHandler(t)
		h.provider.client.Transport = testTransport(func(*http.Request) (*http.Response, error) {
			result := testCreateResponse()
			result["redirect_url"] = target
			return providerResponse(result)
		})
		receipt := createTestOrder(t, h, "untrusted")
		if receipt.CheckoutURL != nil || receipt.Status != "pending" {
			t.Fatal("untrusted redirect exposed")
		}
	}
}

func TestIntegerProviderAmounts(t *testing.T) {
	for input, want := range map[string]string{`"1.01"`: "101", `1.01`: "101", `"1"`: "100", `"0.5"`: "50", `"9999999999999999999999999999.99"`: "999999999999999999999999999999"} {
		got, ok := providerAmountMinor(json.RawMessage(input))
		if !ok || got != want {
			t.Fatalf("amount %s = %s, %v", input, got, ok)
		}
	}
	for _, input := range []string{`"1.001"`, `"1e3"`, `-1`, `"01.00"`, `"NaN"`, `null`, `"0"`} {
		if _, ok := providerAmountMinor(json.RawMessage(input)); ok {
			t.Fatalf("invalid provider amount accepted %s", input)
		}
	}
}
