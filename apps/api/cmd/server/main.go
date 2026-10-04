package main

import (
	"context"
	"errors"
	"log"
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

func main() {
	address, err := listenAddress(os.Getenv("PORT"))
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              address,
		Handler:           api.NewHandler(),
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
	log.Printf("Demo API listening on http://%s; real payments are disabled", address)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
