package api

import (
	"net/mail"
	"net/url"
	"strconv"
	"strings"
)

// Options contains server-only merchant settings. Keys must never be bundled
// into the web application. An incomplete configuration remains a demo.
type Options struct {
	PublicKey, PrivateKey                               string
	MerchantApproved, CurrencyApproved                  bool
	Currency, MinAmountMinor, MaxAmountMinor            string
	PublicBaseURL, MerchantName, SupportEmail, DataPath string
}

func OptionsFromEnv(getenv func(string) string) Options {
	return Options{
		PublicKey: getenv("EPOINT_PUBLIC_KEY"), PrivateKey: getenv("EPOINT_PRIVATE_KEY"),
		MerchantApproved: getenv("PAYMENT_MERCHANT_APPROVED") == "true",
		CurrencyApproved: getenv("PAYMENT_CURRENCY_APPROVED") == "true",
		Currency:         getenv("PAYMENT_CURRENCY"), MinAmountMinor: getenv("PAYMENT_MIN_AMOUNT_MINOR"),
		MaxAmountMinor: getenv("PAYMENT_MAX_AMOUNT_MINOR"), PublicBaseURL: getenv("PAYMENT_PUBLIC_BASE_URL"),
		MerchantName: getenv("PAYMENT_MERCHANT_NAME"), SupportEmail: getenv("PAYMENT_SUPPORT_EMAIL"),
		DataPath: getenv("PAYMENT_DATA_PATH"),
	}
}

func (o Options) ready() bool {
	if strings.TrimSpace(o.PublicKey) == "" || strings.TrimSpace(o.PrivateKey) == "" || !o.MerchantApproved || !o.CurrencyApproved {
		return false
	}
	if o.Currency != "USD" && o.Currency != "AZN" {
		return false
	}
	if !validPositiveMinor(o.MinAmountMinor) || !validPositiveMinor(o.MaxAmountMinor) {
		return false
	}
	// The public minimum remains a JSON number for the existing web contract.
	minimum, err := strconv.ParseUint(o.MinAmountMinor, 10, 64)
	if err != nil || minimum > 9007199254740991 {
		return false
	}
	if compareMinor(o.MaxAmountMinor, o.MinAmountMinor) < 0 {
		return false
	}
	base, err := url.Parse(o.PublicBaseURL)
	if err != nil || base.Scheme != "https" || base.Hostname() == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return false
	}
	if strings.TrimSpace(o.MerchantName) == "" || strings.TrimSpace(o.DataPath) == "" {
		return false
	}
	email, err := mail.ParseAddress(o.SupportEmail)
	return err == nil && email.Address == o.SupportEmail
}
