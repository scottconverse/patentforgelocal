import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PriorArtPanel from './PriorArtPanel';
import type { PriorArtSearch, PriorArtResult } from '../types';

// Mock EventSource globally
class MockEventSource {
  url: string;
  listeners: Record<string, ((...args: unknown[]) => unknown)[]> = {};
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(event: string, handler: (...args: unknown[]) => unknown) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }
  removeEventListener(event: string, handler: (...args: unknown[]) => unknown) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
  }
}

vi.stubGlobal('EventSource', MockEventSource);
vi.stubGlobal('fetch', vi.fn());

const makeResult = (overrides: Partial<PriorArtResult> = {}): PriorArtResult => ({
  id: 'r1',
  searchId: 's1',
  patentNumber: 'US10234567B2',
  title: 'Widget Processing Method',
  abstract: 'A method for processing widgets efficiently.',
  relevanceScore: 0.85,
  snippet: 'Key finding about widgets.',
  source: 'PatentsView',
  ...overrides,
});

const makeSearch = (overrides: Partial<PriorArtSearch> = {}): PriorArtSearch => ({
  id: 's1',
  projectId: 'proj-1',
  version: 1,
  status: 'COMPLETE',
  query: '["widget processing","automated widget"]',
  startedAt: '2026-03-31T10:00:00Z',
  completedAt: '2026-03-31T10:02:00Z',
  results: [makeResult()],
  ...overrides,
});

describe('PriorArtPanel', () => {
  const onUpdate = vi.fn();
  const onPatentClick = vi.fn();
  const projectId = 'proj-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when search is null', () => {
    render(<PriorArtPanel projectId={projectId} search={null} onUpdate={onUpdate} />);
    expect(screen.getByText(/Prior art search will run automatically/)).toBeInTheDocument();
  });

  it('shows empty state when search status is NONE', () => {
    const search = makeSearch({ status: 'NONE' as any, results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText(/Prior art search will run automatically/)).toBeInTheDocument();
  });

  it('shows loading state when status is RUNNING', () => {
    const search = makeSearch({ status: 'RUNNING', results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText(/Searching USPTO patent database/)).toBeInTheDocument();
    // Should show skeleton cards
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows loading state when status is PENDING', () => {
    const search = makeSearch({ status: 'PENDING', results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText(/Searching USPTO patent database/)).toBeInTheDocument();
  });

  it('shows error state with ODP key prompt', () => {
    const search = makeSearch({ status: 'ERROR', results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('Structured prior art search unavailable')).toBeInTheDocument();
    expect(screen.getByText(/USPTO Open Data Portal API key/)).toBeInTheDocument();
    expect(screen.getByText(/feasibility analysis still uses AI web search/)).toBeInTheDocument();
  });

  it('shows error state with link to Settings', () => {
    const search = makeSearch({ status: 'ERROR', results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    const settingsLink = screen.getByText(/USPTO Open Data Portal API key/);
    expect(settingsLink.closest('a')).toHaveAttribute('href', '/settings');
  });

  it('renders completed search with results', () => {
    const search = makeSearch();
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('1 patent found')).toBeInTheDocument();
    expect(screen.getByText('US10234567B2')).toBeInTheDocument();
    expect(screen.getByText('Widget Processing Method')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders multiple results with correct pluralization', () => {
    const search = makeSearch({
      results: [
        makeResult({ id: 'r1', patentNumber: 'US10234567B2' }),
        makeResult({ id: 'r2', patentNumber: 'US99999999A1', title: 'Another Widget' }),
      ],
    });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('2 patents found')).toBeInTheDocument();
  });

  it('shows parsed search queries as tags', () => {
    const search = makeSearch();
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('widget processing')).toBeInTheDocument();
    expect(screen.getByText('automated widget')).toBeInTheDocument();
  });

  it('handles invalid query JSON gracefully', () => {
    const search = makeSearch({ query: 'not valid json' });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    // Should not crash — just no query tags shown
    expect(screen.getByText('1 patent found')).toBeInTheDocument();
  });

  it('calls onPatentClick when a result card is clicked', () => {
    const search = makeSearch();
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} onPatentClick={onPatentClick} />);
    fireEvent.click(screen.getByText('US10234567B2'));
    expect(onPatentClick).toHaveBeenCalledWith('US10234567B2');
  });

  it('shows relevance bar with correct color for high score', () => {
    const search = makeSearch({
      results: [makeResult({ relevanceScore: 0.85 })],
    });
    const { container } = render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('85%')).toBeInTheDocument();
    // Green for >=70%
    expect(container.querySelector('.bg-green-500')).toBeTruthy();
  });

  it('shows amber relevance bar for medium score', () => {
    const search = makeSearch({
      results: [makeResult({ relevanceScore: 0.55 })],
    });
    const { container } = render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber-500')).toBeTruthy();
  });

  it('shows gray relevance bar for low score', () => {
    const search = makeSearch({
      results: [makeResult({ relevanceScore: 0.2 })],
    });
    const { container } = render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(container.querySelector('.bg-gray-500')).toBeTruthy();
  });

  it('shows empty results message when search is complete but no results', () => {
    const search = makeSearch({ results: [] });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('No relevant patents found for this invention.')).toBeInTheDocument();
  });

  it('displays snippet or abstract preview in result cards', () => {
    const search = makeSearch({
      results: [makeResult({ snippet: 'Key finding about widgets.' })],
    });
    render(<PriorArtPanel projectId={projectId} search={search} onUpdate={onUpdate} />);
    expect(screen.getByText('Key finding about widgets.')).toBeInTheDocument();
  });
});
