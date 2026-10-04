package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func requestAPI(method, path, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	response := httptest.NewRecorder()
	NewHandler().ServeHTTP(response, request)
	return response
}

func TestDemoConfig(t *testing.T) {
	response := requestAPI(http.MethodGet, "/api/config", "")
	if response.Code != http.StatusOK {
		t.Fatalf("config status = %d", response.Code)
	}
	var config serviceConfig
	if err := json.Unmarshal(response.Body.Bytes(), &config); err != nil {
		t.Fatal(err)
	}
	if config.Mode != "demo" || config.Currency != "USD" || config.MinAmountMinor != 100 || config.CharitySharePercent != 25 {
		t.Fatalf("unexpected config: %+v", config)
	}
	if config.PaymentsEnabled || config.PaymentMethods == nil || len(config.PaymentMethods) != 0 {
		t.Fatalf("demo must advertise no payment methods: %+v", config)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("config must not be cached")
	}
}

func TestHealthAndUnknownRoute(t *testing.T) {
	health := requestAPI(http.MethodGet, "/api/health", "")
	if health.Code != http.StatusOK || strings.TrimSpace(health.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("unexpected health response: %d %s", health.Code, health.Body.String())
	}
	unknown := requestAPI(http.MethodGet, "/api/payments/webhook", "")
	assertError(t, unknown, http.StatusNotFound, "NOT_FOUND")
}

func TestUnsupportedMethods(t *testing.T) {
	for _, test := range []struct {
		path, allowed, method string
	}{
		{"/api/config", http.MethodGet, http.MethodPost},
		{"/api/health", http.MethodGet, http.MethodDelete},
		{"/api/payments/create", http.MethodPost, http.MethodGet},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := requestAPI(test.method, test.path, "")
			assertError(t, response, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED")
			if response.Header().Get("Allow") != test.allowed {
				t.Fatalf("Allow = %q, want %q", response.Header().Get("Allow"), test.allowed)
			}
		})
	}
}

func TestRejectInvalidPaymentRequests(t *testing.T) {
	for _, test := range []struct {
		name, body, code string
		status           int
	}{
		{"malformed JSON", `{`, "INVALID_REQUEST", 400},
		{"empty body", ``, "INVALID_REQUEST", 400},
		{"missing fields", `{}`, "INVALID_AMOUNT", 400},
		{"unknown field", `{"amountMinor":"100","currency":"USD","intention":"love","returnUrl":"https://example.com"}`, "INVALID_REQUEST", 400},
		{"numeric amount", `{"amountMinor":100,"currency":"USD","intention":"love"}`, "INVALID_REQUEST", 400},
		{"multiple objects", `{"amountMinor":"100","currency":"USD","intention":"love"} {}`, "INVALID_REQUEST", 400},
		{"under minimum", `{"amountMinor":"99","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"negative amount", `{"amountMinor":"-100","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"fractional cents", `{"amountMinor":"100.5","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"exponent", `{"amountMinor":"1e3","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"whitespace in amount", `{"amountMinor":" 100","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"leading zeros", `{"amountMinor":"0100","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"length limit", `{"amountMinor":"1111111111111111111111111111111","currency":"USD","intention":"love"}`, "INVALID_AMOUNT", 400},
		{"wrong currency", `{"amountMinor":"100","currency":"AZN","intention":"love"}`, "INVALID_CURRENCY", 400},
		{"wrong intention", `{"amountMinor":"100","currency":"USD","intention":"magic"}`, "INVALID_INTENTION", 400},
		{"body size", `{"amountMinor":"` + strings.Repeat("1", maxRequestBytes) + `","currency":"USD","intention":"love"}`, "REQUEST_TOO_LARGE", 413},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := requestAPI(http.MethodPost, "/api/payments/create", test.body)
			assertError(t, response, test.status, test.code)
		})
	}
}

func TestValidRequestsCannotCreatePayments(t *testing.T) {
	for _, intention := range []string{"wealth", "health", "success", "love", "gratitude"} {
		for _, amount := range []string{"100", "1250", "999999999999999999999999999999"} {
			body := `{"amountMinor":"` + amount + `","currency":"USD","intention":"` + intention + `"}`
			response := requestAPI(http.MethodPost, "/api/payments/create", body)
			assertError(t, response, http.StatusServiceUnavailable, "PAYMENTS_NOT_CONFIGURED")
			if response.Header().Get("Location") != "" {
				t.Fatal("demo must not redirect to a checkout")
			}
			if strings.Contains(response.Body.String(), "paymentId") || strings.Contains(response.Body.String(), "checkoutUrl") {
				t.Fatal("demo must not invent a payment session")
			}
		}
	}
}

func assertError(t *testing.T, response *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d; body: %s", response.Code, status, response.Body.String())
	}
	var result apiError
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Code != code || result.Message == "" {
		t.Fatalf("unexpected error response: %+v, want code %s", result, code)
	}
}
