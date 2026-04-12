package services

import (
	"io"
	"log"
	"net/http"
	"time"
)

const (
	healthInterval     = 30 * time.Second
	maxConsecFailures  = 3
	maxRestartAttempts = 3
	healthTimeout      = 5 * time.Second
)

// HealthMonitor periodically pings each service's health endpoint and
// attempts to restart services that have become unresponsive. It skips
// services in StatusStopped (user intentionally stopped them).
type HealthMonitor struct {
	manager        *Manager
	logger         *log.Logger
	failures       map[string]int // consecutive failures per service
	restarts       map[string]int // restart attempts per service
	onStatusChange func(status string)
	stopCh         chan struct{}
}

// NewHealthMonitor creates a monitor that checks the given manager's
// services and invokes onStatusChange whenever the overall status may
// have changed.
func NewHealthMonitor(mgr *Manager, logger *log.Logger, onStatusChange func(string)) *HealthMonitor {
	return &HealthMonitor{
		manager:        mgr,
		logger:         logger,
		failures:       make(map[string]int),
		restarts:       make(map[string]int),
		onStatusChange: onStatusChange,
		stopCh:         make(chan struct{}),
	}
}

// Start begins periodic health checks in a background goroutine.
func (h *HealthMonitor) Start() {
	ticker := time.NewTicker(healthInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				h.checkAll()
			case <-h.stopCh:
				return
			}
		}
	}()
}

// Stop signals the background goroutine to exit.
func (h *HealthMonitor) Stop() {
	close(h.stopCh)
}

// checkAll iterates over every service, pings its health endpoint,
// and attempts restart after maxConsecFailures consecutive failures.
func (h *HealthMonitor) checkAll() {
	for _, svc := range h.manager.Services() {
		if svc.Status() == StatusStopped {
			continue
		}

		healthy := h.ping(svc.HealthURL)
		if healthy {
			if h.failures[svc.Name] > 0 {
				h.logger.Printf("Health restored for %s", svc.Name)
			}
			h.failures[svc.Name] = 0
			continue
		}

		h.failures[svc.Name]++
		h.logger.Printf("Health check failed for %s (%d consecutive)", svc.Name, h.failures[svc.Name])

		if h.failures[svc.Name] >= maxConsecFailures {
			if h.restarts[svc.Name] < maxRestartAttempts {
				h.restarts[svc.Name]++
				h.logger.Printf("Attempting restart of %s (attempt %d/%d)",
					svc.Name, h.restarts[svc.Name], maxRestartAttempts)
				svc.Stop()
				time.Sleep(1 * time.Second)
				if err := svc.Start(h.manager.Context()); err != nil {
					h.logger.Printf("Restart failed for %s: %v", svc.Name, err)
				} else {
					h.failures[svc.Name] = 0
				}
			} else {
				h.logger.Printf("%s has failed after %d restart attempts — giving up",
					svc.Name, maxRestartAttempts)
			}
		}
	}

	status := h.manager.OverallStatus()
	if h.onStatusChange != nil {
		h.onStatusChange(status)
	}
}

// ping makes an HTTP GET to the given URL and returns true only if the
// response status is 2xx.
func (h *HealthMonitor) ping(url string) bool {
	client := http.Client{Timeout: healthTimeout}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}
