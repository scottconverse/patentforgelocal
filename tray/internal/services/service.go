package services

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

// ServiceStatus represents the current state of a managed service.
type ServiceStatus int

const (
	StatusStopped  ServiceStatus = iota
	StatusStarting
	StatusRunning
	StatusFailed
)

// String returns a human-readable status label.
func (s ServiceStatus) String() string {
	switch s {
	case StatusStopped:
		return "Stopped"
	case StatusStarting:
		return "Starting"
	case StatusRunning:
		return "Running"
	case StatusFailed:
		return "Failed"
	default:
		return "Unknown"
	}
}

// Service represents a single managed child process.
type Service struct {
	Name      string
	Command   string
	Args      []string
	WorkDir   string
	Port      int
	HealthURL string
	Env       []string
	LogFile   string

	cmd     *exec.Cmd
	cancel  context.CancelFunc
	logFile *os.File
	status  ServiceStatus
	mu      sync.Mutex
}

// Start spawns the service process, redirecting stdout and stderr to
// the configured log file. It returns an error if the port is already
// in use or the process fails to launch.
func (s *Service) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.status == StatusRunning || s.status == StatusStarting {
		return nil
	}

	// Check for port conflict before attempting to start
	if isPortInUse(s.Port) {
		s.status = StatusFailed
		return fmt.Errorf("port %d is already in use — cannot start %s", s.Port, s.Name)
	}

	// Ensure log directory exists
	logDir := filepath.Dir(s.LogFile)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		s.status = StatusFailed
		return fmt.Errorf("failed to create log directory %s: %w", logDir, err)
	}

	// Open log file for stdout/stderr
	logFile, err := os.OpenFile(s.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		s.status = StatusFailed
		return fmt.Errorf("failed to open log file %s: %w", s.LogFile, err)
	}

	s.logFile = logFile

	childCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	s.cmd = exec.CommandContext(childCtx, s.Command, s.Args...)
	s.cmd.Dir = s.WorkDir
	s.cmd.Stdout = logFile
	s.cmd.Stderr = logFile
	s.cmd.Env = s.Env

	s.status = StatusStarting

	if err := s.cmd.Start(); err != nil {
		logFile.Close()
		s.logFile = nil
		cancel()
		s.status = StatusFailed
		return fmt.Errorf("failed to start %s: %w", s.Name, err)
	}

	// Monitor the process in the background — if it exits unexpectedly,
	// mark it as failed and close the log file.
	go func() {
		_ = s.cmd.Wait()
		s.mu.Lock()
		if s.logFile != nil {
			s.logFile.Close()
			s.logFile = nil
		}
		if s.status == StatusRunning || s.status == StatusStarting {
			s.status = StatusFailed
		}
		s.mu.Unlock()
	}()

	return nil
}

// WaitReady polls the service health URL until it returns HTTP 200 or
// the timeout expires.
func (s *Service) WaitReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		// Check if the process has already exited
		s.mu.Lock()
		st := s.status
		s.mu.Unlock()
		if st == StatusFailed || st == StatusStopped {
			return fmt.Errorf("%s exited before becoming ready", s.Name)
		}

		resp, err := client.Get(s.HealthURL)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				s.mu.Lock()
				s.status = StatusRunning
				s.mu.Unlock()
				return nil
			}
		}

		time.Sleep(500 * time.Millisecond)
	}

	s.mu.Lock()
	s.status = StatusFailed
	s.mu.Unlock()
	return fmt.Errorf("%s did not become ready within %s", s.Name, timeout)
}

// Stop gracefully shuts down the service. It cancels the context (which
// sends the OS interrupt) and waits up to 5 seconds for the process to
// exit before force-killing it.
func (s *Service) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	cmd := s.cmd
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}

	if cmd != nil && cmd.Process != nil {
		// Wait briefly for graceful exit, then force-kill
		done := make(chan struct{})
		go func() {
			_ = cmd.Wait()
			close(done)
		}()

		select {
		case <-done:
			// Exited gracefully
		case <-time.After(5 * time.Second):
			_ = cmd.Process.Kill()
			<-done
		}
	}

	s.mu.Lock()
	if s.logFile != nil {
		s.logFile.Close()
		s.logFile = nil
	}
	s.status = StatusStopped
	s.cancel = nil
	s.cmd = nil
	s.mu.Unlock()
}

// Status returns the current service status in a thread-safe manner.
func (s *Service) Status() ServiceStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.status
}
