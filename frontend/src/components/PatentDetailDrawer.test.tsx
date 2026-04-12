import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PatentDetailDrawer from './PatentDetailDrawer';

// Mock the api module
vi.mock('../api', () => ({
  api: {
    patents: {
      getDetail: vi.fn(),
      getClaims: vi.fn(),
      getFamily: vi.fn(),
    },
  },
}));

import { api } from '../api';

const mockDetail = {
  patentNumber: 'US10234567B2',
  title: 'Method for Widget Processing',
  abstract: 'A method and system for processing widgets.',
  filingDate: '2021-03-15',
  grantDate: '2023-06-20',
  assignee: ['Acme Corp', 'Widget LLC'],
  inventors: ['John Smith', 'Jane Doe'],
  cpcClassifications: [
    { code: 'G06N3/08', title: 'Learning methods' },
    { code: 'G06F16/00', title: 'Information retrieval' },
  ],
  claimsText: '1. A method comprising: step a; step b.',
  claimCount: 12,
  patentType: 'utility',
};

describe('PatentDetailDrawer', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when patentNumber is null', () => {
    const { container } = render(<PatentDetailDrawer patentNumber={null} onClose={onClose} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows loading skeleton while fetching', () => {
    // Never resolve the promise — stays in loading state
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    // Should show the overlay backdrop
    expect(screen.getByText('Patent Detail')).toBeInTheDocument();
    // Loading skeleton has animated pulse divs — check the container has content
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('displays patent details after successful fetch', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Method for Widget Processing')).toBeInTheDocument();
    });

    expect(screen.getByText('2021-03-15')).toBeInTheDocument();
    expect(screen.getByText('2023-06-20')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Widget LLC')).toBeInTheDocument();
    expect(screen.getByText('John Smith, Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('utility')).toBeInTheDocument();
    expect(screen.getByText('G06N3/08')).toBeInTheDocument();
    expect(screen.getByText('Learning methods')).toBeInTheDocument();
  });

  it('shows error state when fetch fails with key message', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API error 404: Patent detail requires a USPTO API key'),
    );

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent detail unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText(/USPTO Open Data Portal API key/)).toBeInTheDocument();
  });

  it('shows generic error when fetch fails without key message', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('API error 500: Internal server error'),
    );

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent detail unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText(/Could not retrieve patent details/)).toBeInTheDocument();
  });

  it('shows Google Patents link in header', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    const link = screen.getByText(/Google Patents/);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', 'https://patents.google.com/patent/US10234567B2');
  });

  it('toggles claims section on click', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    // Claims text should not be visible initially
    expect(screen.queryByText('1. A method comprising: step a; step b.')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText(/Claims/));

    expect(screen.getByText('1. A method comprising: step a; step b.')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText(/Claims/));

    expect(screen.queryByText('1. A method comprising: step a; step b.')).not.toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when close button is clicked', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    // The close button contains the × character
    const closeButton = screen.getByText('×');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lazy-loads claims from API when detail has no claimsText', async () => {
    const noClaimsDetail = { ...mockDetail, claimsText: null, claimCount: null };
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(noClaimsDetail);

    // getClaims returns successfully after delay
    (api.patents.getClaims as ReturnType<typeof vi.fn>).mockResolvedValue({
      claimsText: '1. A lazy-loaded claim.',
      claimCount: 1,
    });

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    // Expand claims — should trigger lazy fetch
    fireEvent.click(screen.getByText(/Claims/));

    // Should show loading spinner
    expect(screen.getByText(/Loading claims from USPTO/)).toBeInTheDocument();

    // Wait for claims to load
    await waitFor(() => {
      expect(screen.getByText('1. A lazy-loaded claim.')).toBeInTheDocument();
    });

    // getClaims should have been called
    expect(api.patents.getClaims).toHaveBeenCalledWith('US10234567B2');
  });

  it('shows fallback link when lazy-load returns null claims', async () => {
    const noClaimsDetail = { ...mockDetail, claimsText: null, claimCount: null };
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(noClaimsDetail);

    (api.patents.getClaims as ReturnType<typeof vi.fn>).mockResolvedValue({
      claimsText: null,
      claimCount: null,
    });

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Claims/));

    await waitFor(() => {
      expect(screen.getByText(/Claims text not available/)).toBeInTheDocument();
    });
    expect(screen.getByText(/View on Google Patents/)).toBeInTheDocument();
  });

  it('shows error state when lazy-load fails', async () => {
    const noClaimsDetail = { ...mockDetail, claimsText: null, claimCount: null };
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(noClaimsDetail);

    (api.patents.getClaims as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error 500: Internal error'));

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Claims/));

    await waitFor(() => {
      expect(screen.getByText(/Could not load claims/)).toBeInTheDocument();
    });
  });

  it('does not re-fetch claims when collapsing and re-expanding', async () => {
    const noClaimsDetail = { ...mockDetail, claimsText: null, claimCount: null };
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(noClaimsDetail);

    (api.patents.getClaims as ReturnType<typeof vi.fn>).mockResolvedValue({
      claimsText: '1. Claim text.',
      claimCount: 1,
    });

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    // Expand → fetch
    fireEvent.click(screen.getByText(/Claims/));
    await waitFor(() => {
      expect(screen.getByText('1. Claim text.')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText(/Claims/));

    // Re-expand — should NOT re-fetch
    fireEvent.click(screen.getByText(/Claims/));
    expect(api.patents.getClaims).toHaveBeenCalledTimes(1);
  });

  it('skips lazy-load when detail already has claimsText', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Claims/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Claims/));

    expect(screen.getByText('1. A method comprising: step a; step b.')).toBeInTheDocument();
    expect(api.patents.getClaims).not.toHaveBeenCalled();
  });

  it('shows CPC overflow indicator when more than 8 classifications', async () => {
    const manyClassifications = Array.from({ length: 12 }, (_, i) => ({
      code: `G06N${i}/00`,
      title: `Classification ${i}`,
    }));
    const detailWithManyCPC = { ...mockDetail, cpcClassifications: manyClassifications };
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detailWithManyCPC);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('+4 more')).toBeInTheDocument();
    });
  });

  it('lazy-loads patent family when section is expanded', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);
    (api.patents.getFamily as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        patentNumber: '11500000',
        applicationNumber: '16123456',
        relationship: 'continuation',
        filingDate: '2020-03-15',
        grantDate: '2022-01-10',
        title: 'Parent Invention',
        status: 'granted',
      },
      {
        patentNumber: null,
        applicationNumber: '18678901',
        relationship: 'divisional',
        filingDate: '2024-08-01',
        grantDate: null,
        title: 'Child Application',
        status: 'pending',
      },
    ]);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent Family')).toBeInTheDocument();
    });

    // Family not visible initially
    expect(screen.queryByText('continuation')).not.toBeInTheDocument();

    // Expand family section
    fireEvent.click(screen.getByText('Patent Family'));

    // Should show loading spinner
    expect(screen.getByText(/Loading patent family/)).toBeInTheDocument();

    // Wait for family data
    await waitFor(() => {
      expect(screen.getByText('continuation')).toBeInTheDocument();
    });

    expect(screen.getByText('divisional')).toBeInTheDocument();
    expect(screen.getByText('granted')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('Parent Invention')).toBeInTheDocument();
    expect(screen.getByText('App. 18678901')).toBeInTheDocument();
    expect(api.patents.getFamily).toHaveBeenCalledWith('US10234567B2');
  });

  it('shows empty state when no family members found', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);
    (api.patents.getFamily as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent Family')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Patent Family'));

    await waitFor(() => {
      expect(screen.getByText('No related patents found.')).toBeInTheDocument();
    });
  });

  it('shows error when family fetch fails', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);
    (api.patents.getFamily as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error 500: Internal error'));

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent Family')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Patent Family'));

    await waitFor(() => {
      expect(screen.getByText(/Could not load patent family/)).toBeInTheDocument();
    });
  });

  it('does not re-fetch family when collapsing and re-expanding', async () => {
    (api.patents.getDetail as ReturnType<typeof vi.fn>).mockResolvedValue(mockDetail);
    (api.patents.getFamily as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        patentNumber: '11500000',
        applicationNumber: '16123456',
        relationship: 'continuation',
        filingDate: '2020-03-15',
        grantDate: '2022-01-10',
        title: 'Parent Invention',
        status: 'granted',
      },
    ]);

    render(<PatentDetailDrawer patentNumber="US10234567B2" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Patent Family')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByText('Patent Family'));
    await waitFor(() => {
      expect(screen.getByText('continuation')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(screen.getByText('Patent Family'));

    // Re-expand — should NOT re-fetch
    fireEvent.click(screen.getByText('Patent Family'));
    expect(api.patents.getFamily).toHaveBeenCalledTimes(1);
  });
});
