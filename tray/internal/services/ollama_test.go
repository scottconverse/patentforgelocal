package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestIsModelAvailable_Found(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]string{
					{"name": "gemma4:e4b"},
				},
			})
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("IsModelAvailable() error: %v", err)
	}
	if !available {
		t.Error("IsModelAvailable() = false, want true")
	}
}

func TestIsModelAvailable_NotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]string{
					{"name": "llama3:8b"},
				},
			})
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("IsModelAvailable() error: %v", err)
	}
	if available {
		t.Error("IsModelAvailable() = true, want false")
	}
}

func TestIsModelAvailable_EmptyModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]string{},
			})
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")
	available, err := mgr.IsModelAvailable()
	if err != nil {
		t.Fatalf("IsModelAvailable() error: %v", err)
	}
	if available {
		t.Error("IsModelAvailable() = true, want false")
	}
}

func TestIsModelAvailable_ServerDown(t *testing.T) {
	mgr := NewOllamaManager("http://127.0.0.1:19999", "gemma4:e4b")
	_, err := mgr.IsModelAvailable()
	if err == nil {
		t.Error("IsModelAvailable() expected error for unreachable server, got nil")
	}
}

func TestPullModel_Progress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/pull":
			flusher, ok := w.(http.Flusher)
			if !ok {
				t.Fatal("server does not support flushing")
			}
			w.Header().Set("Content-Type", "application/x-ndjson")
			w.WriteHeader(http.StatusOK)

			events := []map[string]interface{}{
				{"status": "pulling manifest"},
				{"status": "downloading", "completed": int64(500), "total": int64(1000)},
				{"status": "downloading", "completed": int64(1000), "total": int64(1000)},
				{"status": "success"},
			}
			for _, ev := range events {
				data, _ := json.Marshal(ev)
				fmt.Fprintf(w, "%s\n", data)
				flusher.Flush()
			}
		case "/api/tags":
			// After pull completes, doPull calls IsModelAvailable
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]string{
					{"name": "gemma4:e4b"},
				},
			})
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")
	err := mgr.PullModel()
	if err != nil {
		t.Fatalf("PullModel() error: %v", err)
	}

	// Wait for the background goroutine to finish
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		p := mgr.GetProgress()
		if p.Status == "complete" || p.Status == "error" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	progress := mgr.GetProgress()
	if progress.Status != "complete" {
		t.Errorf("final status = %q, want %q", progress.Status, "complete")
	}
	if progress.Percent != 100.0 {
		t.Errorf("final percent = %f, want 100.0", progress.Percent)
	}
}

func TestPullModel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/pull" {
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")
	err := mgr.PullModel()
	if err != nil {
		t.Fatalf("PullModel() should not return error on start: %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		p := mgr.GetProgress()
		if p.Status == "error" || p.Status == "complete" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	progress := mgr.GetProgress()
	if progress.Status != "error" {
		t.Errorf("status = %q, want %q", progress.Status, "error")
	}
	if progress.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestPullModel_DuplicatePull(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/pull":
			// Slow pull — hold the connection open
			flusher, ok := w.(http.Flusher)
			if !ok {
				return
			}
			w.Header().Set("Content-Type", "application/x-ndjson")
			w.WriteHeader(http.StatusOK)
			data, _ := json.Marshal(map[string]interface{}{
				"status": "downloading", "completed": int64(1), "total": int64(1000),
			})
			fmt.Fprintf(w, "%s\n", data)
			flusher.Flush()
			// Block to keep pull "in progress"
			time.Sleep(3 * time.Second)
			successData, _ := json.Marshal(map[string]string{"status": "success"})
			fmt.Fprintf(w, "%s\n", successData)
			flusher.Flush()
		case "/api/tags":
			json.NewEncoder(w).Encode(map[string]interface{}{
				"models": []map[string]string{{"name": "gemma4:e4b"}},
			})
		}
	}))
	defer server.Close()

	mgr := NewOllamaManager(server.URL, "gemma4:e4b")

	err := mgr.PullModel()
	if err != nil {
		t.Fatalf("first PullModel() error: %v", err)
	}

	// Give goroutine time to start and set pulling=true
	time.Sleep(100 * time.Millisecond)

	err = mgr.PullModel()
	if err == nil {
		t.Error("second PullModel() should return error when pull is in progress")
	}
}

func TestGetProgress_InitialState(t *testing.T) {
	mgr := NewOllamaManager("http://127.0.0.1:11434", "gemma4:e4b")
	progress := mgr.GetProgress()
	if progress.Status != "idle" {
		t.Errorf("initial status = %q, want %q", progress.Status, "idle")
	}
}
