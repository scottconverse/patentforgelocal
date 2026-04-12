//go:build !windows

package instance

import (
	"os"
	"syscall"
)

// isProcessAlive checks whether a process with the given PID is still running.
// On Unix, sending signal 0 checks existence without affecting the process.
func isProcessAlive(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = proc.Signal(syscall.Signal(0))
	return err == nil
}
