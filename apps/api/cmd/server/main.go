package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"into-nowhere/api"
)

func listenAddress(port string) (string, error) {
	if port == "" {
		port = "8080"
	}
	for _, digit := range port {
		if digit < '0' || digit > '9' {
			return "", errors.New("PORT must be a number from 1 to 65535")
		}
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return "", errors.New("PORT must be a number from 1 to 65535")
	}
	return "127.0.0.1:" + strconv.Itoa(number), nil
}

func configuredListenAddress(port, explicit string) (string, error) {
	if explicit == "" {
		return listenAddress(port)
	}
	host, number, err := net.SplitHostPort(explicit)
	if err != nil || (net.ParseIP(host) == nil && host != "localhost") {
		return "", errors.New("LISTEN_ADDR must be an explicit IP address and port")
	}
	checked, err := listenAddress(number)
	if err != nil {
		return "", err
	}
	_, validatedPort, _ := net.SplitHostPort(checked)
	return net.JoinHostPort(host, validatedPort), nil
}

func main() {
	address, err := configuredListenAddress(os.Getenv("PORT"), os.Getenv("LISTEN_ADDR"))
	if err != nil {
		log.Fatal(err)
	}
	handler, err := api.NewConfiguredHandler(api.OptionsFromEnv(os.Getenv))
	if err != nil {
		log.Fatal(err)
	}
	defer handler.Close()
	server := &http.Server{
		Addr:              address,
		Handler:           handler,
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		shutdown, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if err := server.Shutdown(shutdown); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()
	if handler.PaymentsEnabled() {
		log.Printf("Payment API listening on %s; Epoint checkout is configured", address)
	} else {
		log.Printf("Demo API listening on %s; real payments are disabled", address)
	}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
