import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ComplianceTab from './ComplianceTab';

vi.mock('../api', () => ({
  api: {
    compliance: {
      startCheck: vi.fn(),
      getLatest: vi.fn(),
    },
  },
}));

describe('ComplianceTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows no-claims message when hasClaims is false', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'NONE', results: [] });
    render(<ComplianceTab projectId="test-123" hasClaims={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Draft claims before running/i)).toBeTruthy();
    });
    expect(screen.getByText(/Compliance checking requires completed claim drafts/i)).toBeTruthy();
  });

  it('shows run button when hasClaims is true and no check exists', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'NONE', results: [] });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('Run Compliance Check')).toBeTruthy();
    });
  });

  it('shows spinner when running is true and check is null', async () => {
    const { api } = await import('../api');
    // Initial load returns NONE → check stays null
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'NONE', results: [] });
    (api.compliance.startCheck as any).mockResolvedValue({});
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    // Wait for initial load — should show run button
    await waitFor(() => {
      expect(screen.getByText('Run Compliance Check')).toBeTruthy();
    });
    // Click run → opens UPL modal
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await waitFor(() => {
      expect(screen.getByText(/This is a research tool, not a legal service/i)).toBeTruthy();
    });
    // Check acknowledgment checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    // Click modal's run button — sets running=true, check is still null
    const modalRunBtn = screen.getAllByText('Run Compliance Check').find((btn) => btn.closest('.fixed') !== null)!;
    fireEvent.click(modalRunBtn);
    // Spinner should appear (running=true, check=null)
    await waitFor(() => {
      expect(screen.getByText(/Running compliance checks/i)).toBeTruthy();
    });
  });

  it('shows spinner when check is running', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'RUNNING', results: [] });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Running compliance checks/i)).toBeTruthy();
    });
  });

  it('shows results when check is complete with passing results', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      overallPass: true,
      results: [
        {
          rule: '112a_written_description',
          status: 'PASS',
          claimNumber: 1,
          detail: 'Supported by specification',
          citation: 'MPEP 2163',
        },
      ],
    });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('All checks passed')).toBeTruthy();
    });
    // Sections start collapsed — expand to see result details
    fireEvent.click(screen.getByText('112(a) Written Description'));
    expect(screen.getByText('Supported by specification')).toBeTruthy();
    expect(screen.getByText('MPEP 2163')).toBeTruthy();
    expect(screen.getByText('Re-check Claims')).toBeTruthy();
  });

  it('shows error state with retry button', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'ERROR', results: [] });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Compliance check failed/i)).toBeTruthy();
    });
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('shows UPL disclaimer banner on results', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      overallPass: false,
      results: [
        {
          rule: '112b_definiteness',
          status: 'FAIL',
          claimNumber: 2,
          detail: 'Missing antecedent basis',
          citation: 'MPEP 2173.05(e)',
          suggestion: 'Add antecedent basis for "the device"',
        },
      ],
    });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText(/RESEARCH OUTPUT — NOT LEGAL ADVICE/i)).toBeTruthy();
    });
    expect(screen.getByText(/1 issue found/i)).toBeTruthy();
    // Sections start collapsed — expand the definiteness section to see results
    fireEvent.click(screen.getByText('112(b) Definiteness'));
    expect(screen.getByText('Missing antecedent basis')).toBeTruthy();
    expect(screen.getByText('MPEP 2173.05(e)')).toBeTruthy();
    expect(screen.getByText('Add antecedent basis for "the device"')).toBeTruthy();
  });

  it('shows UPL modal when run button clicked without acknowledgment', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({ status: 'NONE', results: [] });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('Run Compliance Check')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Run Compliance Check'));
    await waitFor(() => {
      expect(screen.getByText(/This is a research tool, not a legal service/i)).toBeTruthy();
    });
    expect(screen.getByText(/I understand this is AI-generated research, not legal advice/i)).toBeTruthy();
  });

  it('shows results grouped by rule category', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      overallPass: false,
      results: [
        {
          rule: '112a_written_description',
          status: 'PASS',
          claimNumber: 1,
          detail: 'Supported',
          citation: 'MPEP 2163',
        },
        { rule: '112b_definiteness', status: 'FAIL', claimNumber: 2, detail: 'Unclear scope', citation: 'MPEP 2173' },
        {
          rule: 'mpep_608_formalities',
          status: 'WARN',
          claimNumber: null,
          detail: 'Missing reference numerals',
          citation: 'MPEP 608.01(m)',
        },
        {
          rule: '101_eligibility',
          status: 'PASS',
          claimNumber: 1,
          detail: 'Eligible subject matter',
          citation: '35 USC 101',
        },
      ],
    });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('112(a) Written Description')).toBeTruthy();
    });
    expect(screen.getByText('112(b) Definiteness')).toBeTruthy();
    expect(screen.getByText('MPEP 608 Formalities')).toBeTruthy();
    expect(screen.getByText('101 Eligibility')).toBeTruthy();
  });

  it('displays cost when available', async () => {
    const { api } = await import('../api');
    (api.compliance.getLatest as any).mockResolvedValue({
      status: 'COMPLETE',
      overallPass: true,
      estimatedCostUsd: 0.42,
      results: [{ rule: '112a_written_description', status: 'PASS', claimNumber: 1, detail: 'OK', citation: '' }],
    });
    render(<ComplianceTab projectId="test-123" hasClaims={true} />);
    await waitFor(() => {
      expect(screen.getByText('$0.42')).toBeTruthy();
    });
  });
});
