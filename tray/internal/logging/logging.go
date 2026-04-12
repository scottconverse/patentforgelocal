package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	maxLogSize  = 10 * 1024 * 1024 // 10MB per file
	maxLogFiles = 5                 // keep 5 rotated files
)

// Setup creates a logger that writes to both stdout and a rotating log file.
// Returns the logger and a cleanup function to close the file.
func Setup(logsDir string, name string) (*log.Logger, func(), error) {
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return nil, nil, fmt.Errorf("failed to create logs directory: %w", err)
	}

	logPath := filepath.Join(logsDir, name+".log")

	// Rotate if current log is too large
	if info, err := os.Stat(logPath); err == nil && info.Size() > maxLogSize {
		rotate(logsDir, name)
	}

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open log file %s: %w", logPath, err)
	}

	multi := io.MultiWriter(os.Stdout, f)
	logger := log.New(multi, fmt.Sprintf("[%s] ", name), log.LstdFlags)

	cleanup := func() {
		f.Close()
	}

	return logger, cleanup, nil
}

func rotate(dir, name string) {
	base := filepath.Join(dir, name)

	// Remove oldest files if at max
	files := getRotatedFiles(dir, name)
	for len(files) >= maxLogFiles-1 {
		os.Remove(files[0])
		files = files[1:]
	}

	// Shift existing rotated files up: .4 -> .5, .3 -> .4, etc.
	for i := maxLogFiles - 1; i >= 1; i-- {
		old := fmt.Sprintf("%s.%d.log", base, i)
		newPath := fmt.Sprintf("%s.%d.log", base, i+1)
		os.Rename(old, newPath)
	}

	// Current log becomes .1
	os.Rename(base+".log", fmt.Sprintf("%s.1.log", base))
}

func getRotatedFiles(dir, name string) []string {
	var files []string
	entries, _ := os.ReadDir(dir)
	prefix := name + "."
	for _, e := range entries {
		n := e.Name()
		if strings.HasPrefix(n, prefix) && strings.HasSuffix(n, ".log") && n != name+".log" {
			files = append(files, filepath.Join(dir, n))
		}
	}
	sort.Strings(files)
	return files
}
