import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ApplicationTab from './ApplicationTab';

vi.mock('../api', () => ({
  api: {
    application: {
      start: vi.fn(),
      getLatest: vi.fn(),
      updateSection: vi.fn(),
    },
  },
}));

describe('ApplicationTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no-claims message when hasClaims is false', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({ status: 'NONE' });
    render(<ApplicationTab projectId="test" hasClaims={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Draft claims before generating/i)).toBeTruthy();
    });
  });

  it('shows generate button when no application exists', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({ status: 'NONE' });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('Generate Application')).toBeTruthy();
    });
  });

  it('shows UPL modal on generate click', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({ status: 'NONE' });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('Generate Application')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Generate Application'));
    await waitFor(() => {
      expect(screen.getByText(/research tool, not a legal service/i)).toBeTruthy();
    });
  });

  it('shows spinner when generating', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({ status: 'RUNNING' });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Generating patent application/i)).toBeTruthy();
    });
  });

  it('shows sections when complete', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      title: 'Widget System',
      background: 'The field of widgets...',
      summary: 'A widget system...',
      claims: '1. A method.',
    });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Background/i)).toBeTruthy();
    });
  });

  it('shows error state with retry button', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({ status: 'ERROR', errorMessage: 'API failed' });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Generation failed/i)).toBeTruthy();
    });
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('shows empty-sections warning when complete but all sections are null', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      title: null,
      background: null,
      summary: null,
      detailedDescription: null,
      claims: null,
      abstract: null,
      figureDescriptions: null,
      crossReferences: null,
      idsTable: null,
    });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Application generated but all sections are empty/i)).toBeTruthy();
    });
    // Regenerate button should be present in the toolbar
    const regenerateButtons = screen.getAllByText(/Regenerate/i);
    expect(regenerateButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows cost when available', async () => {
    const { api } = await import('../api');
    (api.application.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      estimatedCostUsd: 0.85,
      background: 'Text',
      claims: '1. A method.',
    });
    render(<ApplicationTab projectId="test" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('$0.85')).toBeTruthy();
    });
  });
});
