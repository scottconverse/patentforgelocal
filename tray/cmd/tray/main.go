package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"fyne.io/systray"
	"github.com/scottconverse/patentforge/tray/internal/assets"
	"github.com/scottconverse/patentforge/tray/internal/config"
	"github.com/scottconverse/patentforge/tray/internal/instance"
	"github.com/scottconverse/patentforge/tray/internal/logging"
	"github.com/scottconverse/patentforge/tray/internal/services"
)

var (
	version    = "0.7.0-dev"
	cfg        *config.Config
	mgr        *services.Manager
	healthMon  *services.HealthMonitor
	mStatus    *systray.MenuItem
	logger     *log.Logger
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot determine executable path: %v\n", err)
		os.Exit(1)
	}
	baseDir := filepath.Dir(exe)

	// Single-instance check — prevent duplicate launches
	cleanup, err := instance.Lock(baseDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer cleanup()

	// Set up rotating log file
	var logCleanup func()
	logger, logCleanup, err = logging.Setup(filepath.Join(baseDir, "logs"), "tray")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to setup logging: %v\n", err)
		os.Exit(1)
	}
	defer logCleanup()
	logger.Println("PatentForge tray starting...")

	// Load or generate configuration
	cfg, err = config.Load(baseDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
		os.Exit(1)
	}

	// Create the service manager
	mgr = services.NewManager(cfg)

	systray.Run(onReady, onExit)
}

func onReady() {
	// Windows systray requires .ico format; macOS/Linux use .png
	if runtime.GOOS == "windows" {
		systray.SetIcon(assets.IconICO)
	} else {
		systray.SetIcon(assets.IconPNG)
	}
	systray.SetTitle("PatentForge")
	systray.SetTooltip("PatentForge — Starting...")

	// Menu items
	mOpen := systray.AddMenuItem("Open PatentForge", "Open in browser")
	mStatus = systray.AddMenuItem("Status: Starting...", "")
	mStatus.Disable()
	systray.AddSeparator()
	mLogs := systray.AddMenuItem("View Logs", "Open logs directory")
	mRestart := systray.AddMenuItem("Restart Services", "Restart all services")
	mAbout := systray.AddMenuItem(fmt.Sprintf("About PatentForge v%s", version), "")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Stop all services and exit")

	// Start all services in background
	go func() {
		if err := mgr.StartAll(); err != nil {
			logger.Printf("Service startup failed: %v", err)
			updateStatus()
			return
		}
		updateStatus()
		// Begin background health monitoring
		healthMon = services.NewHealthMonitor(mgr, logger, func(status string) {
			mStatus.SetTitle(fmt.Sprintf("Status: %s", status))
			systray.SetTooltip(fmt.Sprintf("PatentForge — %s", status))
		})
		healthMon.Start()
		// Open browser once all services are ready
		if err := openBrowser(fmt.Sprintf("http://localhost:%d", cfg.PortUI)); err != nil {
			logger.Printf("Failed to open browser: %v", err)
		}
	}()

	// Handle menu clicks
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				if err := openBrowser(fmt.Sprintf("http://localhost:%d", cfg.PortUI)); err != nil {
					logger.Printf("Failed to open browser: %v", err)
				}
			case <-mLogs.ClickedCh:
				if err := openFileExplorer(getLogsDir()); err != nil {
					logger.Printf("Failed to open logs directory: %v", err)
				}
			case <-mRestart.ClickedCh:
				go func() {
					mStatus.SetTitle("Status: Restarting...")
					systray.SetTooltip("PatentForge — Restarting...")
					if healthMon != nil {
						healthMon.Stop()
					}
					mgr.StopAll()
					// Create a fresh manager so context is not already cancelled
					mgr = services.NewManager(cfg)
					if err := mgr.StartAll(); err != nil {
						logger.Printf("Restart failed: %v", err)
					}
					updateStatus()
					healthMon = services.NewHealthMonitor(mgr, logger, func(status string) {
						mStatus.SetTitle(fmt.Sprintf("Status: %s", status))
						systray.SetTooltip(fmt.Sprintf("PatentForge — %s", status))
					})
					healthMon.Start()
				}()
			case <-mAbout.ClickedCh:
				if err := openBrowser("https://github.com/scottconverse/patentforge/releases"); err != nil {
					logger.Printf("Failed to open browser: %v", err)
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func onExit() {
	logger.Println("PatentForge shutting down...")
	if healthMon != nil {
		healthMon.Stop()
	}
	if mgr != nil {
		mgr.StopAll()
	}
}

// updateStatus sets the tray menu and tooltip to reflect overall service health.
func updateStatus() {
	if mgr == nil || mStatus == nil {
		return
	}
	status := mgr.OverallStatus()
	mStatus.SetTitle(fmt.Sprintf("Status: %s", status))
	systray.SetTooltip(fmt.Sprintf("PatentForge — %s", status))
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

func openFileExplorer(path string) error {
	if err := os.MkdirAll(path, 0755); err != nil {
		return err
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", path)
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}

func getLogsDir() string {
	if cfg != nil {
		return cfg.LogsDir
	}
	exe, err := os.Executable()
	if err != nil {
		if home, homeErr := os.UserHomeDir(); homeErr == nil {
			return filepath.Join(home, "PatentForge", "logs")
		}
		return "."
	}
	return filepath.Join(filepath.Dir(exe), "logs")
}
