// Package instance provides single-instance enforcement for PatentForge.
// It uses a PID-based lockfile to prevent multiple copies from running.
package instance

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Lock acquires a single-instance lock for the application.
// It creates a lockfile containing the current PID at <baseDir>/patentforge.lock.
//
// If a lockfile already exists and the referenced process is still alive,
// it returns an error. If the process is dead, it removes the stale lockfile
// and proceeds.
//
// Returns a cleanup function that removes the lockfile on exit.
func Lock(baseDir string) (func(), error) {
	lockPath := filepath.Join(baseDir, "patentforge.lock")

	// Check for existing lockfile
	if data, err := os.ReadFile(lockPath); err == nil {
		pidStr := strings.TrimSpace(string(data))
		if pid, parseErr := strconv.Atoi(pidStr); parseErr == nil {
			if isProcessAlive(pid) {
				return nil, fmt.Errorf("PatentForge is already running (PID %d)", pid)
			}
		}
		// Stale lockfile — remove it
		_ = os.Remove(lockPath)
	}

	// Write our PID
	pid := os.Getpid()
	if err := os.WriteFile(lockPath, []byte(strconv.Itoa(pid)), 0600); err != nil {
		return nil, fmt.Errorf("failed to create lockfile: %w", err)
	}

	cleanup := func() {
		_ = os.Remove(lockPath)
	}

	return cleanup, nil
}
