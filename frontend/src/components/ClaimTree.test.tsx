import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClaimTree from './ClaimTree';

function makeClaim(
  overrides: Partial<{
    id: string;
    claimNumber: number;
    claimType: string;
    scopeLevel: string | null;
    statutoryType: string | null;
    parentClaimNumber: number | null;
    text: string;
  }> = {},
) {
  return {
    id: `claim-${overrides.claimNumber ?? 1}`,
    claimNumber: 1,
    claimType: 'INDEPENDENT',
    scopeLevel: null,
    statutoryType: null,
    parentClaimNumber: null,
    text: 'A method for testing.',
    ...overrides,
  };
}

describe('ClaimTree', () => {
  it('shows empty message when no claims', () => {
    render(<ClaimTree claims={[]} />);
    expect(screen.getByText('No claims to visualize.')).toBeTruthy();
  });

  it('renders SVG with one independent claim node', () => {
    const claims = [makeClaim({ claimNumber: 1, claimType: 'INDEPENDENT', statutoryType: 'method' })];
    const { container } = render(<ClaimTree claims={claims} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(screen.getByText('Claim 1')).toBeTruthy();
    expect(screen.getByText('method')).toBeTruthy();
  });

  it('renders independent + dependent claims with connector lines', () => {
    const claims = [
      makeClaim({ id: 'c1', claimNumber: 1, claimType: 'INDEPENDENT' }),
      makeClaim({ id: 'c2', claimNumber: 2, claimType: 'DEPENDENT', parentClaimNumber: 1 }),
      makeClaim({ id: 'c3', claimNumber: 3, claimType: 'DEPENDENT', parentClaimNumber: 1 }),
    ];
    const { container } = render(<ClaimTree claims={claims} />);

    // 3 nodes rendered
    expect(screen.getByText('Claim 1')).toBeTruthy();
    expect(screen.getByText('Claim 2')).toBeTruthy();
    expect(screen.getByText('Claim 3')).toBeTruthy();

    // 2 connector lines (one per dependent claim)
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('renders multiple independent claims as separate subtrees', () => {
    const claims = [
      makeClaim({ id: 'c1', claimNumber: 1, claimType: 'INDEPENDENT', statutoryType: 'method' }),
      makeClaim({ id: 'c4', claimNumber: 4, claimType: 'INDEPENDENT', statutoryType: 'apparatus' }),
      makeClaim({ id: 'c2', claimNumber: 2, claimType: 'DEPENDENT', parentClaimNumber: 1 }),
      makeClaim({ id: 'c5', claimNumber: 5, claimType: 'DEPENDENT', parentClaimNumber: 4 }),
    ];
    const { container } = render(<ClaimTree claims={claims} />);

    // 4 nodes, 2 lines
    const rects = container.querySelectorAll('rect');
    // Each node has 2 rects (fill + hover overlay)
    expect(rects.length).toBe(8);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('calls onClaimClick when a node is clicked', () => {
    const onClick = vi.fn();
    const claims = [makeClaim({ id: 'claim-1', claimNumber: 1, claimType: 'INDEPENDENT' })];
    render(<ClaimTree claims={claims} onClaimClick={onClick} />);

    fireEvent.click(screen.getByText('Claim 1'));
    expect(onClick).toHaveBeenCalledWith('claim-1');
  });

  it('shows dependent claim subtitle with parent reference', () => {
    const claims = [
      makeClaim({ id: 'c1', claimNumber: 1, claimType: 'INDEPENDENT' }),
      makeClaim({ id: 'c2', claimNumber: 2, claimType: 'DEPENDENT', parentClaimNumber: 1 }),
    ];
    render(<ClaimTree claims={claims} />);
    expect(screen.getByText('dep. on 1')).toBeTruthy();
  });
});
