package api

import (
	"bytes"
	"context"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const epointAPIBase = "https://epoint.az/api/1/"

type epointClient struct {
	publicKey, privateKey string
	client                *http.Client
}

type providerPayment struct {
	Status        string          `json:"status"`
	Code          json.RawMessage `json:"code"`
	Transaction   string          `json:"transaction"`
	RedirectURL   string          `json:"redirect_url"`
	OrderID       string          `json:"order_id"`
	OperationCode string          `json:"operation_code"`
	Amount        json.RawMessage `json:"amount"`
	// Currency is absent from the documented callback/status schemas. If a
	// future response includes it, it must still match the original order.
	Currency string `json:"currency"`
}

func newEpointClient(options Options) *epointClient {
	return &epointClient{publicKey: options.PublicKey, privateKey: options.PrivateKey,
		client: &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

// Epoint specifies base64(raw SHA-1(private_key + data + private_key)), not
// HMAC. data is the exact base64-encoded JSON string sent in the form body.
func epointSignature(privateKey, data string) string {
	digest := sha1.Sum([]byte(privateKey + data + privateKey))
	return base64.StdEncoding.EncodeToString(digest[:])
}

func validEpointSignature(privateKey, data, signature string) bool {
	expected := epointSignature(privateKey, data)
	return len(signature) == len(expected) && subtle.ConstantTimeCompare([]byte(signature), []byte(expected)) == 1
}

func (p *epointClient) call(ctx context.Context, endpoint string, payload any) (providerPayment, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return providerPayment{}, errors.New("cannot encode provider request")
	}
	data := base64.StdEncoding.EncodeToString(encoded)
	form := url.Values{"data": {data}, "signature": {epointSignature(p.privateKey, data)}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, epointAPIBase+endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return providerPayment{}, errors.New("cannot create provider request")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return providerPayment{}, errors.New("provider is temporarily unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return providerPayment{}, errors.New("provider did not accept the request")
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 65537))
	var result providerPayment
	if err := decoder.Decode(&result); err != nil {
		return providerPayment{}, errors.New("invalid provider response")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return providerPayment{}, errors.New("invalid provider response")
	}
	return result, nil
}

func (p *epointClient) create(ctx context.Context, entry order, returnURL string) (providerPayment, error) {
	return p.call(ctx, "request", struct {
		PublicKey          string      `json:"public_key"`
		Amount             json.Number `json:"amount"`
		Currency           string      `json:"currency"`
		Language           string      `json:"language"`
		OrderID            string      `json:"order_id"`
		Description        string      `json:"description"`
		SuccessRedirectURL string      `json:"success_redirect_url"`
		ErrorRedirectURL   string      `json:"error_redirect_url"`
	}{p.publicKey, json.Number(minorToDecimal(entry.AmountMinor)), entry.Currency, entry.Locale,
		entry.ID, "Release: symbolic digital experience", returnURL, returnURL})
}

func (p *epointClient) status(ctx context.Context, transaction string) (providerPayment, error) {
	return p.call(ctx, "get-status", struct {
		PublicKey   string `json:"public_key"`
		Transaction string `json:"transaction"`
	}{p.publicKey, transaction})
}

func trustedEpointCheckout(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Hostname() == "epoint.az" &&
		(parsed.Port() == "" || parsed.Port() == "443") && parsed.User == nil && parsed.Fragment == ""
}

func validPositiveMinor(value string) bool {
	if len(value) == 0 || len(value) > 30 || value[0] == '0' {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func compareMinor(left, right string) int {
	a, _ := new(big.Int).SetString(left, 10)
	b, _ := new(big.Int).SetString(right, 10)
	return a.Cmp(b)
}

func minorToDecimal(value string) string {
	if len(value) == 1 {
		return "0.0" + value
	}
	if len(value) == 2 {
		return "0." + value
	}
	return value[:len(value)-2] + "." + value[len(value)-2:]
}

func providerAmountMinor(raw json.RawMessage) (string, bool) {
	var value string
	if len(raw) == 0 {
		return "", false
	}
	if raw[0] == '"' {
		if json.Unmarshal(raw, &value) != nil {
			return "", false
		}
	} else {
		value = string(raw)
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || len(parts[0]) == 0 || len(parts[0]) > 28 {
		return "", false
	}
	for _, character := range parts[0] {
		if character < '0' || character > '9' {
			return "", false
		}
	}
	if len(parts[0]) > 1 && parts[0][0] == '0' {
		return "", false
	}
	fraction := "00"
	if len(parts) == 2 {
		if len(parts[1]) == 0 || len(parts[1]) > 2 {
			return "", false
		}
		for _, character := range parts[1] {
			if character < '0' || character > '9' {
				return "", false
			}
		}
		fraction = parts[1]
		if len(fraction) == 1 {
			fraction += "0"
		}
	}
	minor := strings.TrimLeft(parts[0]+fraction, "0")
	if minor == "" {
		return "", false
	}
	return minor, validPositiveMinor(minor)
}

func decodeProviderPayment(data string) (providerPayment, error) {
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(decoded) > 64<<10 {
		return providerPayment{}, errors.New("invalid provider data")
	}
	decoder := json.NewDecoder(bytes.NewReader(decoded))
	var payment providerPayment
	if err = decoder.Decode(&payment); err != nil {
		return providerPayment{}, errors.New("invalid provider data")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return providerPayment{}, errors.New("invalid provider data")
	}
	return payment, nil
}

func providerPaymentMatches(payment providerPayment, entry order) bool {
	minor, ok := providerAmountMinor(payment.Amount)
	return ok && minor == entry.AmountMinor && payment.OperationCode == "100" &&
		payment.Transaction != "" && (entry.Transaction == "" || payment.Transaction == entry.Transaction) &&
		(payment.Currency == "" || payment.Currency == entry.Currency) &&
		(payment.OrderID == "" || payment.OrderID == entry.ID)
}

func verifiedProviderStatus(status string) string {
	switch status {
	case "success":
		return "paid"
	case "failed", "error":
		return "failed"
	case "returned":
		return "refunded"
	default:
		return "pending" // new/server_error/unknown do not prove a charge.
	}
}
