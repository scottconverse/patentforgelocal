package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/scottconverse/patentforge/tray/internal/config"
)

// Manager owns and orchestrates the lifecycle of all PatentForge services.
type Manager struct {
	cfg      *config.Config
	services []*Service
	ctx      context.Context
	cancel   context.CancelFunc
}

// NewManager creates a Manager with all 5 PatentForge services configured.
func NewManager(cfg *config.Config) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		cfg:    cfg,
		ctx:    ctx,
		cancel: cancel,
	}
	m.services = m.buildServices()
	return m
}

// buildServices constructs the 5 Service structs with correct commands,
// paths, environment variables, and health endpoints.
func (m *Manager) buildServices() []*Service {
	baseDir := m.cfg.BaseDir
	logsDir := m.cfg.LogsDir

	// Platform-specific binary extension and python path
	ext := ""
	var pythonCmd string
	if runtime.GOOS == "windows" {
		ext = ".exe"
		pythonCmd = filepath.Join(baseDir, "runtime", "python", "python.exe")
	} else {
		pythonCmd = filepath.Join(baseDir, "runtime", "python", "bin", "python3")
	}

	// Common env vars loaded from system environment + config
	baseEnv := m.buildBaseEnv()

	// Service URLs for cross-service communication
	feasibilityURL := fmt.Sprintf("http://localhost:%d", m.cfg.PortAPI)
	claimDrafterURL := fmt.Sprintf("http://localhost:%d", m.cfg.PortGeneration)
	appGeneratorURL := fmt.Sprintf("http://localhost:%d", m.cfg.PortAnalysis)
	complianceURL := fmt.Sprintf("http://localhost:%d", m.cfg.PortResearch)

	// 1. Backend — Node SEA binary serving frontend + API
	backendEnv := append(copyEnv(baseEnv),
		fmt.Sprintf("DATABASE_URL=%s", m.cfg.DatabaseURL),
		fmt.Sprintf("INTERNAL_SERVICE_SECRET=%s", m.cfg.ServiceSecret),
		fmt.Sprintf("ALLOWED_ORIGINS=http://localhost:%d", m.cfg.PortUI),
		"NODE_ENV=production",
		fmt.Sprintf("PORT=%d", m.cfg.PortUI),
		fmt.Sprintf("FRONTEND_DIST_PATH=%s", filepath.Join(baseDir, "frontend", "dist")),
		fmt.Sprintf("PRISMA_QUERY_ENGINE_LIBRARY=%s", findPrismaEngine(baseDir)),
		fmt.Sprintf("FEASIBILITY_URL=%s", feasibilityURL),
		fmt.Sprintf("CLAIM_DRAFTER_URL=%s", claimDrafterURL),
		fmt.Sprintf("APPLICATION_GENERATOR_URL=%s", appGeneratorURL),
		fmt.Sprintf("COMPLIANCE_CHECKER_URL=%s", complianceURL),
	)

	backend := &Service{
		Name:      "backend",
		Command:   filepath.Join(baseDir, "patentforge-backend"+ext),
		WorkDir:   baseDir,
		Port:      m.cfg.PortUI,
		HealthURL: fmt.Sprintf("http://localhost:%d/api/health", m.cfg.PortUI),
		Env:       backendEnv,
		LogFile:   filepath.Join(logsDir, "backend.log"),
	}

	// 2. Feasibility — Node SEA binary
	feasibilityEnv := append(copyEnv(baseEnv),
		fmt.Sprintf("INTERNAL_SERVICE_SECRET=%s", m.cfg.ServiceSecret),
		fmt.Sprintf("PORT=%d", m.cfg.PortAPI),
	)

	feasibility := &Service{
		Name:      "feasibility",
		Command:   filepath.Join(baseDir, "patentforge-feasibility"+ext),
		WorkDir:   baseDir,
		Port:      m.cfg.PortAPI,
		HealthURL: fmt.Sprintf("http://localhost:%d/health", m.cfg.PortAPI),
		Env:       feasibilityEnv,
		LogFile:   filepath.Join(logsDir, "feasibility.log"),
	}

	// 3. Claim Drafter — Python uvicorn
	claimDrafterEnv := append(copyEnv(baseEnv),
		fmt.Sprintf("INTERNAL_SERVICE_SECRET=%s", m.cfg.ServiceSecret),
	)

	claimDrafter := &Service{
		Name:      "claim-drafter",
		Command:   pythonCmd,
		Args:      []string{"-m", "uvicorn", "src.server:app", "--host", "127.0.0.1", "--port", fmt.Sprintf("%d", m.cfg.PortGeneration)},
		WorkDir:   filepath.Join(baseDir, "services", "claim-drafter"),
		Port:      m.cfg.PortGeneration,
		HealthURL: fmt.Sprintf("http://localhost:%d/health", m.cfg.PortGeneration),
		Env:       claimDrafterEnv,
		LogFile:   filepath.Join(logsDir, "claim-drafter.log"),
	}

	// 4. Application Generator — Python uvicorn
	appGenEnv := append(copyEnv(baseEnv),
		fmt.Sprintf("INTERNAL_SERVICE_SECRET=%s", m.cfg.ServiceSecret),
	)

	appGenerator := &Service{
		Name:      "application-generator",
		Command:   pythonCmd,
		Args:      []string{"-m", "uvicorn", "src.server:app", "--host", "127.0.0.1", "--port", fmt.Sprintf("%d", m.cfg.PortAnalysis)},
		WorkDir:   filepath.Join(baseDir, "services", "application-generator"),
		Port:      m.cfg.PortAnalysis,
		HealthURL: fmt.Sprintf("http://localhost:%d/health", m.cfg.PortAnalysis),
		Env:       appGenEnv,
		LogFile:   filepath.Join(logsDir, "application-generator.log"),
	}

	// 5. Compliance Checker — Python uvicorn
	complianceEnv := append(copyEnv(baseEnv),
		fmt.Sprintf("INTERNAL_SERVICE_SECRET=%s", m.cfg.ServiceSecret),
	)

	complianceChecker := &Service{
		Name:      "compliance-checker",
		Command:   pythonCmd,
		Args:      []string{"-m", "uvicorn", "src.server:app", "--host", "127.0.0.1", "--port", fmt.Sprintf("%d", m.cfg.PortResearch)},
		WorkDir:   filepath.Join(baseDir, "services", "compliance-checker"),
		Port:      m.cfg.PortResearch,
		HealthURL: fmt.Sprintf("http://localhost:%d/health", m.cfg.PortResearch),
		Env:       complianceEnv,
		LogFile:   filepath.Join(logsDir, "compliance-checker.log"),
	}

	return []*Service{backend, feasibility, claimDrafter, appGenerator, complianceChecker}
}

// buildBaseEnv constructs the base environment variable slice that all
// services inherit. Includes PATH from the host and ANTHROPIC_API_KEY
// if set.
func (m *Manager) buildBaseEnv() []string {
	env := []string{
		fmt.Sprintf("PATH=%s", os.Getenv("PATH")),
	}

	// Pass through ANTHROPIC_API_KEY from host environment
	if apiKey := os.Getenv("ANTHROPIC_API_KEY"); apiKey != "" {
		env = append(env, fmt.Sprintf("ANTHROPIC_API_KEY=%s", apiKey))
	}

	return env
}

// copyEnv returns a copy of the slice so append operations on one
// service's env don't corrupt another's.
func copyEnv(src []string) []string {
	dst := make([]string, len(src))
	copy(dst, src)
	return dst
}

// StartAll starts each service sequentially, waiting for it to become
// ready before starting the next. Returns an error describing which
// service failed to start.
func (m *Manager) StartAll() error {
	for _, svc := range m.services {
		fmt.Printf("Starting %s on port %d...\n", svc.Name, svc.Port)

		if err := svc.Start(m.ctx); err != nil {
			return fmt.Errorf("failed to start %s: %w", svc.Name, err)
		}

		if err := svc.WaitReady(30 * time.Second); err != nil {
			return fmt.Errorf("%s failed readiness check: %w", svc.Name, err)
		}

		fmt.Printf("  %s ready.\n", svc.Name)
	}

	fmt.Println("All services started.")
	return nil
}

// StopAll stops every service in reverse order (last started = first stopped).
func (m *Manager) StopAll() {
	fmt.Println("Stopping all services...")
	for i := len(m.services) - 1; i >= 0; i-- {
		svc := m.services[i]
		fmt.Printf("  Stopping %s...\n", svc.Name)
		svc.Stop()
	}
	m.cancel()
	fmt.Println("All services stopped.")
}

// OverallStatus returns a summary string:
//   - "Running" — all services are running
//   - "Stopped" — all services are stopped
//   - "Degraded (<name> down)" — at least one service is not running
func (m *Manager) OverallStatus() string {
	running := 0
	stopped := 0
	var degraded []string

	for _, svc := range m.services {
		switch svc.Status() {
		case StatusRunning:
			running++
		case StatusStopped:
			stopped++
		default:
			degraded = append(degraded, svc.Name)
		}
	}

	if running == len(m.services) {
		return "Running"
	}
	if stopped == len(m.services) {
		return "Stopped"
	}
	if len(degraded) > 0 {
		return fmt.Sprintf("Degraded (%s down)", strings.Join(degraded, ", "))
	}
	return "Stopped"
}

// Context returns the manager's context, used by the health monitor
// to restart failed services with the correct parent context.
func (m *Manager) Context() context.Context {
	return m.ctx
}

// Services returns the managed service list (read-only use).
func (m *Manager) Services() []*Service {
	return m.services
}

// findPrismaEngine locates the Prisma query engine library in the
// patentforge-backend-prisma directory. The filename varies by platform
// (e.g. query_engine-windows.dll.node on Windows).
func findPrismaEngine(baseDir string) string {
	prismaDir := filepath.Join(baseDir, "patentforge-backend-prisma")
	entries, err := os.ReadDir(prismaDir)
	if err != nil {
		return filepath.Join(prismaDir, "query_engine-windows.dll.node") // fallback
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "query_engine-") || strings.HasPrefix(name, "libquery_engine-") {
			return filepath.Join(prismaDir, name)
		}
	}
	return filepath.Join(prismaDir, "query_engine-windows.dll.node") // fallback
}
