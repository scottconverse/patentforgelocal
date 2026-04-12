//go:build windows

package instance

import (
	"golang.org/x/sys/windows"
)

// isProcessAlive checks whether a process with the given PID is still running.
// On Windows, os.FindProcess always succeeds, so we open a handle with
// limited access and check if it's valid.
func isProcessAlive(pid int) bool {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	_ = windows.CloseHandle(handle)
	return true
}
