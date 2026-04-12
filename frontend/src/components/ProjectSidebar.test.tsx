import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProjectSidebar, { StatusBadge } from './ProjectSidebar';
import type { FeasibilityStage, PriorArtSearch, Project } from '../types';

// Mock StageProgress to avoid complex setup
vi.mock('./StageProgress', () => ({
  default: () => <div data-testid="stage-progress">StageProgress</div>,
}));

const noop = () => {};

function makeStage(overrides: Partial<FeasibilityStage> = {}): FeasibilityStage {
  return {
    id: 'stage-1',
    feasibilityRunId: 'run-1',
    stageNumber: 1,
    stageName: 'Technical Intake',
    status: 'PENDING',
    webSearchUsed: false,
    ...overrides,
  };
}

const mockProject: Project = {
  id: 'proj-1',
  title: 'Test Project',
  status: 'FEASIBILITY',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  invention: {
    id: 'inv-1',
    projectId: 'proj-1',
    title: 'Test Invention',
    description: 'A test invention',
  },
};

const defaultProps = {
  project: mockProject,
  viewMode: 'overview' as const,
  displayStages: [makeStage()],
  activeStageNum: undefined,
  latestRun: null,
  totalRunCost: 0,
  cancelling: false,
  isRunning: false,
  priorArtSearch: null,
  claimDraftStatus: null,
  complianceStatus: null,
  applicationStatus: null,
  onViewModeChange: noop,
  onRunFeasibility: noop,
  onResume: noop,
  onCancel: noop,
  onShowHistory: noop,
  onStageClick: noop,
  onRerunFromStage: noop,
};

describe('ProjectSidebar', () => {
  it('renders Pipeline and Actions sections', () => {
    render(<ProjectSidebar {...defaultProps} />);
    // Both mobile toggle + desktop heading render "Pipeline" / "Actions"
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Actions').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Invention Intake and Feasibility labels', () => {
    render(<ProjectSidebar {...defaultProps} />);
    expect(screen.getByText('Invention Intake')).toBeInTheDocument();
    expect(screen.getByText('Feasibility')).toBeInTheDocument();
  });

  it('renders Prior Art, Claims, Compliance, Application buttons', () => {
    render(<ProjectSidebar {...defaultProps} />);
    expect(screen.getByText('Prior Art')).toBeInTheDocument();
    expect(screen.getByText('Claims')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('Application')).toBeInTheDocument();
  });

  it('renders StageProgress component', () => {
    render(<ProjectSidebar {...defaultProps} />);
    expect(screen.getByTestId('stage-progress')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('shows green dot for COMPLETE status', () => {
    const { container } = render(<StatusBadge status="COMPLETE" />);
    expect(container.querySelector('[data-testid="badge-complete"]')).toBeInTheDocument();
  });

  it('shows count badge when COMPLETE with count', () => {
    render(<StatusBadge status="COMPLETE" count={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows spinner for RUNNING status', () => {
    render(<StatusBadge status="RUNNING" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows red dot for ERROR status', () => {
    const { container } = render(<StatusBadge status="ERROR" />);
    expect(container.querySelector('[data-testid="badge-error"]')).toBeInTheDocument();
  });

  it('shows nothing for null/undefined status', () => {
    const { container } = render(<StatusBadge status={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing for NONE status', () => {
    const { container } = render(<StatusBadge status="NONE" />);
    expect(container.innerHTML).toBe('');
  });

  it('uses white count pill when active (on blue button background)', () => {
    render(<StatusBadge status="COMPLETE" count={12} active={true} />);
    const pill = screen.getByText('12');
    expect(pill.className).toContain('text-white');
    expect(pill.className).not.toContain('text-green-300');
  });

  it('uses green count pill when not active (default dark button background)', () => {
    render(<StatusBadge status="COMPLETE" count={12} active={false} />);
    const pill = screen.getByText('12');
    expect(pill.className).toContain('text-green-300');
    expect(pill.className).not.toContain('text-white');
  });
});

describe('ProjectSidebar with status badges', () => {
  it('shows Prior Art count badge when results exist', () => {
    const search: PriorArtSearch = {
      id: 'search-1',
      projectId: 'proj-1',
      version: 1,
      status: 'COMPLETE',
      query: 'test query',
      startedAt: null,
      completedAt: null,
      results: [
        {
          id: 'r1',
          searchId: 'search-1',
          patentNumber: 'US123',
          title: 'Test Patent',
          abstract: null,
          relevanceScore: 0.9,
          snippet: null,
          source: 'pqai',
        },
        {
          id: 'r2',
          searchId: 'search-1',
          patentNumber: 'US456',
          title: 'Another Patent',
          abstract: null,
          relevanceScore: 0.8,
          snippet: null,
          source: 'pqai',
        },
      ],
    };
    render(<ProjectSidebar {...defaultProps} priorArtSearch={search} />);
    // The feasibility step number "2" also renders, so use getAllByText
    const twos = screen.getAllByText('2');
    // At least one "2" should be in a green badge (the prior art count)
    const hasBadge = twos.some((el) => el.classList.contains('text-green-300'));
    expect(hasBadge).toBe(true);
  });

  it('shows green dot for completed claims', () => {
    const { container } = render(
      <ProjectSidebar
        {...defaultProps}
        claimDraftStatus={{ status: 'COMPLETE', claims: [{ id: 'c1' }, { id: 'c2' }] }}
      />,
    );
    // Find the badge-complete within the Claims button area
    const badges = container.querySelectorAll('[data-testid="badge-complete"]');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows spinner for running compliance', () => {
    render(<ProjectSidebar {...defaultProps} complianceStatus={{ status: 'RUNNING' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
