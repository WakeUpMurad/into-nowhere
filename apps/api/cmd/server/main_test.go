package main

import (
	"strings"
	"testing"
)

func TestListenAddress(t *testing.T) {
	for _, port := range []string{"", "8080", "65535"} {
		address, err := listenAddress(port)
		if err != nil || !strings.HasPrefix(address, "127.0.0.1:") {
			t.Fatalf("valid port %q: %q, %v", port, address, err)
		}
	}
	for _, port := range []string{"0", "65536", "-1", "8080 ", "localhost:8080", "1e3", "9999999999999999999999"} {
		if _, err := listenAddress(port); err == nil {
			t.Fatalf("accepted invalid port %q", port)
		}
	}
}

func TestExplicitListenAddress(t *testing.T) {
	for _, address := range []string{"0.0.0.0:8080", "127.0.0.1:9000", "[::]:8080", "localhost:8080"} {
		got, err := configuredListenAddress("", address)
		if err != nil || got != address {
			t.Fatalf("valid explicit address %q: %q, %v", address, got, err)
		}
	}
	for _, address := range []string{":8080", "example.com:8080", "0.0.0.0:0", "http://0.0.0.0:8080", "0.0.0.0:65536"} {
		if _, err := configuredListenAddress("", address); err == nil {
			t.Fatalf("invalid explicit address accepted %q", address)
		}
	}
}
