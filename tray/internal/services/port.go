// Package services manages PatentForge child process lifecycle.
package services

import (
	"fmt"
	"net"
)

// isPortInUse checks whether a TCP port is already bound by attempting
// to listen on it briefly. Returns true if the port is occupied.
func isPortInUse(port int) bool {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return true
	}
	ln.Close()
	return false
}
