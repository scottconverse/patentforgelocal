package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// OllamaManager handles model lifecycle for the Ollama service.
type OllamaManager struct {
	baseURL   string
	modelName string
	mu        sync.Mutex
	pulling   bool
	progress  PullProgress
}

// PullProgress tracks the current model pull state.
type PullProgress struct {
	Status    string  `json:"status"`
	Completed int64   `json:"completed"`
	Total     int64   `json:"total"`
	Percent   float64 `json:"percent"`
	Error     string  `json:"error,omitempty"`
}

// NewOllamaManager creates an OllamaManager for the given Ollama API URL and model.
func NewOllamaManager(baseURL, modelName string) *OllamaManager {
	return &OllamaManager{
		baseURL:   baseURL,
		modelName: modelName,
		progress:  PullProgress{Status: "idle"},
	}
}

// IsModelAvailable checks if the configured model is already downloaded.
func (o *OllamaManager) IsModelAvailable() (bool, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(o.baseURL + "/api/tags")
	if err != nil {
		return false, fmt.Errorf("ollama not reachable: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("failed to parse /api/tags: %w", err)
	}

	for _, m := range result.Models {
		if m.Name == o.modelName || m.Name == o.modelName+":latest" {
			return true, nil
		}
	}
	return false, nil
}

// PullModel starts downloading the model in the background.
func (o *OllamaManager) PullModel() error {
	o.mu.Lock()
	if o.pulling {
		o.mu.Unlock()
		return fmt.Errorf("pull already in progress")
	}
	o.pulling = true
	o.progress = PullProgress{Status: "pulling"}
	o.mu.Unlock()

	go o.doPull()
	return nil
}

// GetProgress returns the current pull progress (thread-safe).
func (o *OllamaManager) GetProgress() PullProgress {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.progress
}

func (o *OllamaManager) doPull() {
	defer func() {
		o.mu.Lock()
		o.pulling = false
		o.mu.Unlock()
	}()

	body, _ := json.Marshal(map[string]interface{}{
		"name":   o.modelName,
		"stream": true,
	})

	resp, err := http.Post(o.baseURL+"/api/pull", "application/json", bytes.NewReader(body))
	if err != nil {
		o.mu.Lock()
		o.progress = PullProgress{Status: "error", Error: err.Error()}
		o.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		o.mu.Lock()
		o.progress = PullProgress{Status: "error", Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
		o.mu.Unlock()
		return
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var event struct {
			Status    string `json:"status"`
			Completed int64  `json:"completed"`
			Total     int64  `json:"total"`
			Error     string `json:"error"`
		}

		if err := decoder.Decode(&event); err != nil {
			if err == io.EOF {
				break
			}
			o.mu.Lock()
			o.progress = PullProgress{Status: "error", Error: err.Error()}
			o.mu.Unlock()
			return
		}

		if event.Error != "" {
			o.mu.Lock()
			o.progress = PullProgress{Status: "error", Error: event.Error}
			o.mu.Unlock()
			return
		}

		o.mu.Lock()
		o.progress.Status = "pulling"
		if event.Total > 0 {
			o.progress.Completed = event.Completed
			o.progress.Total = event.Total
			o.progress.Percent = float64(event.Completed) / float64(event.Total) * 100.0
		}
		if event.Status == "success" {
			o.progress = PullProgress{
				Status:    "complete",
				Completed: o.progress.Total,
				Total:     o.progress.Total,
				Percent:   100.0,
			}
		}
		o.mu.Unlock()
	}

	available, _ := o.IsModelAvailable()
	o.mu.Lock()
	if available && o.progress.Status != "error" {
		o.progress.Status = "complete"
		o.progress.Percent = 100.0
	} else if o.progress.Status == "pulling" {
		o.progress.Status = "error"
		o.progress.Error = "pull ended without success confirmation"
	}
	o.mu.Unlock()
}
