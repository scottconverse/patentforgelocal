import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ClaimsTab from './ClaimsTab';

vi.mock('../api', () => ({
  api: {
    claimDraft: {
      getLatest: vi.fn(),
      start: vi.fn(),
      updateClaim: vi.fn(),
      regenerateClaim: vi.fn(),
      getClaimText: vi.fn(),
    },
  },
}));

vi.mock('./ClaimTree', () => ({
  default: () => <div data-testid="claim-tree">ClaimTree Mock</div>,
}));

/** Mock draft with preview-only claims (default API response without ?full=true) */
const mockDraft = {
  id: 'draft-1',
  version: 1,
  status: 'COMPLETE',
  claims: [
    {
      id: 'c1',
      claimNumber: 1,
      claimType: 'INDEPENDENT',
      scopeLevel: 'BROAD',
      statutoryType: 'method',
      parentClaimNumber: null,
      preview: 'A neural network method comprising training a model on patent data.',
      examinerNotes: '',
    },
    {
      id: 'c2',
      claimNumber: 2,
      claimType: 'DEPENDENT',
      scopeLevel: null,
      statutoryType: null,
      parentClaimNumber: 1,
      preview: 'The method of claim 1, wherein the model uses transformer architecture.',
      examinerNotes: '',
    },
  ],
  specLanguage: null,
  plannerStrategy: null,
  examinerFeedback: null,
  revisionNotes: null,
};

describe('ClaimsTab', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Default getClaimText mock — returns full text on demand
    const { api } = await import('../api');
    (api.claimDraft.getClaimText as any).mockImplementation((_projId: string, claimId: string) => {
      const fullTexts: Record<string, string> = {
        c1: 'A neural network method comprising training a model on patent data.',
        c2: 'The method of claim 1, wherein the model uses transformer architecture.',
      };
      return Promise.resolve({ text: fullTexts[claimId] ?? 'Full text not found' });
    });
  });

  it('findOverlaps returns empty when no prior art — no warning icons', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} priorArtTitles={[]} />);
    // Claims start collapsed — expand claim 1
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A neural network method/)).toBeTruthy();
    });
    expect(screen.queryByText('Potential prior art overlap')).toBeNull();
  });

  it('findOverlaps shows warning when overlap detected', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(
      <ClaimsTab
        projectId="proj-1"
        hasFeasibility={true}
        priorArtTitles={[{ patentNumber: 'US12345', title: 'Neural Network Processing System' }]}
      />,
    );
    // Claims start collapsed — expand claim 1
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A neural network method/)).toBeTruthy();
    });
    // "neural" (6 chars, not a stop word) appears in claim text and prior art title
    expect(screen.getAllByText('Potential prior art overlap').length).toBeGreaterThan(0);
  });

  it('findOverlaps ignores stop words — method in claim and title produces no warning', async () => {
    const { api } = await import('../api');
    const draftStopOnly = {
      ...mockDraft,
      claims: [
        {
          id: 'c1',
          claimNumber: 1,
          claimType: 'INDEPENDENT',
          scopeLevel: 'BROAD',
          statutoryType: 'method',
          parentClaimNumber: null,
          preview: 'A method comprising using a device.',
          examinerNotes: '',
        },
      ],
    };
    (api.claimDraft.getLatest as any).mockResolvedValue(draftStopOnly);
    (api.claimDraft.getClaimText as any).mockResolvedValue({ text: 'A method comprising using a device.' });
    render(
      <ClaimsTab
        projectId="proj-1"
        hasFeasibility={true}
        priorArtTitles={[{ patentNumber: 'US88888', title: 'Method Using the Apparatus' }]}
      />,
    );
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A method comprising using a device/)).toBeTruthy();
    });
    expect(screen.queryByText('Potential prior art overlap')).toBeNull();
  });

  it('findOverlaps ignores stop words — no overlap when title has only stop words and short words', async () => {
    const { api } = await import('../api');
    const draftWithMethodOnly = {
      ...mockDraft,
      claims: [
        {
          id: 'c1',
          claimNumber: 1,
          claimType: 'INDEPENDENT',
          scopeLevel: 'BROAD',
          statutoryType: 'method',
          parentClaimNumber: null,
          preview: 'A method for processing data in a system.',
          examinerNotes: '',
        },
      ],
    };
    (api.claimDraft.getLatest as any).mockResolvedValue(draftWithMethodOnly);
    (api.claimDraft.getClaimText as any).mockResolvedValue({ text: 'A method for processing data in a system.' });
    render(
      <ClaimsTab
        projectId="proj-1"
        hasFeasibility={true}
        priorArtTitles={[{ patentNumber: 'US99999', title: 'Method System Device Apparatus' }]}
      />,
    );
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A method for processing data/)).toBeTruthy();
    });
    expect(screen.queryByText('Potential prior art overlap')).toBeNull();
  });

  it('Regenerate button visible on each claim when expanded', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A neural network method/)).toBeTruthy();
    });
    // Should have Regenerate for independent claim 1 and dependent claim 2
    const regenerateButtons = screen.getAllByText('Regenerate');
    expect(regenerateButtons.length).toBe(2);
  });

  it('handleRegenerate calls API and reloads', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    (api.claimDraft.regenerateClaim as any).mockResolvedValue({});
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A neural network method/)).toBeTruthy();
    });
    const regenerateButtons = screen.getAllByText('Regenerate');
    fireEvent.click(regenerateButtons[0]);
    await waitFor(() => {
      expect(api.claimDraft.regenerateClaim).toHaveBeenCalledWith('proj-1', 1);
    });
    expect((api.claimDraft.getLatest as any).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handleRegenerate shows error on failure', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    (api.claimDraft.regenerateClaim as any).mockRejectedValue(new Error('Server error'));
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText(/A neural network method/)).toBeTruthy();
    });
    const regenerateButtons = screen.getAllByText('Regenerate');
    fireEvent.click(regenerateButtons[0]);
    await waitFor(() => {
      expect(screen.getByText(/Failed to regenerate claim 1: Server error/)).toBeTruthy();
    });
  });

  it('shows spinner when generating is true and draft is null', async () => {
    const { api } = await import('../api');
    // Initial load returns NONE → draft stays null
    (api.claimDraft.getLatest as any).mockResolvedValue({ status: 'NONE', claims: [] });
    (api.claimDraft.start as any).mockResolvedValue({});
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    // Wait for initial load to finish — should show generate button
    await waitFor(() => {
      expect(screen.getByText('Generate Draft Claims')).toBeTruthy();
    });
    // Click generate → opens UPL modal
    fireEvent.click(screen.getByText('Generate Draft Claims'));
    await waitFor(() => {
      expect(screen.getByText(/This is a research tool, not a legal service/i)).toBeTruthy();
    });
    // Check the acknowledgment checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    // Click the modal's generate button — sets generating=true, draft is still null
    const modalGenerateBtn = screen
      .getAllByText('Generate Draft Claims')
      .find((btn) => btn.closest('.fixed') !== null)!;
    fireEvent.click(modalGenerateBtn);
    // Spinner should appear (generating=true, draft=null)
    await waitFor(() => {
      expect(screen.getByText('Generating claim drafts...')).toBeTruthy();
    });
  });

  it('shows spinner when draft status is RUNNING', async () => {
    const { api } = await import('../api');
    // API returns status RUNNING — loadDraft sets draft to the response AND sets generating=true
    (api.claimDraft.getLatest as any).mockResolvedValue({
      id: 'draft-running',
      version: 1,
      status: 'RUNNING',
      claims: [],
      specLanguage: null,
      plannerStrategy: null,
      examinerFeedback: null,
      revisionNotes: null,
    });
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => {
      expect(screen.getByText('Generating claim drafts...')).toBeTruthy();
    });
  });

  it('lazy-loads full claim text when expanding a claim', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    // Expand claim 1
    fireEvent.click(screen.getByText(/Claim 1/));
    // getClaimText should be called for both the independent claim and its dependent
    await waitFor(() => {
      expect(api.claimDraft.getClaimText).toHaveBeenCalledWith('proj-1', 'c1');
      expect(api.claimDraft.getClaimText).toHaveBeenCalledWith('proj-1', 'c2');
    });
  });

  it('does not re-fetch claim text on collapse and re-expand', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    // Expand
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(api.claimDraft.getClaimText).toHaveBeenCalledTimes(2); // c1 + c2
    });
    // Collapse
    fireEvent.click(screen.getByText(/Claim 1/));
    // Re-expand — should not re-fetch
    fireEvent.click(screen.getByText(/Claim 1/));
    // Wait a tick to ensure no new calls
    await waitFor(() => {
      expect(api.claimDraft.getClaimText).toHaveBeenCalledTimes(2); // still 2
    });
  });

  it('shows loading indicator while fetching claim text', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    // Make getClaimText hang (never resolve) to keep loading state visible
    (api.claimDraft.getClaimText as any).mockReturnValue(new Promise(() => {}));
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    fireEvent.click(screen.getByText(/Claim 1/));
    await waitFor(() => {
      expect(screen.getByText('Loading claim text...')).toBeTruthy();
    });
  });

  it('shows preview snippet in collapsed claim header', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue(mockDraft);
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => { expect(screen.getByText(/Claim 1/)).toBeTruthy(); });
    // Should show truncated preview text in the header
    expect(screen.getByText(/A neural network method/)).toBeTruthy();
  });

  it('renders no-feasibility state correctly', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue({ status: 'NONE' });
    render(<ClaimsTab projectId="proj-1" hasFeasibility={false} />);
    // hasFeasibility check happens after loading completes
    await waitFor(() => {
      expect(screen.getByText(/Run a feasibility analysis first/)).toBeTruthy();
    });
    expect(screen.getByText(/Claim drafting requires a completed 6-stage analysis/)).toBeTruthy();
  });

  it('no-draft state shows generate button', async () => {
    const { api } = await import('../api');
    (api.claimDraft.getLatest as any).mockResolvedValue({ status: 'NONE' });
    render(<ClaimsTab projectId="proj-1" hasFeasibility={true} />);
    await waitFor(() => {
      expect(screen.getByText('Generate Draft Claims')).toBeTruthy();
    });
    expect(screen.getByText(/No claim draft yet/)).toBeTruthy();
  });
});
