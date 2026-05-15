import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CostConfirmModal from './CostConfirmModal';

describe('CostConfirmModal', () => {
  const defaultProps = {
    open: true,
    estimatedCostUsd: 0.35,
    provider: 'CLOUD' as const,
    stageCount: 6,
    onApprove: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onApprove.mockReset();
    defaultProps.onCancel.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not render when open=false', () => {
    render(<CostConfirmModal {...defaultProps} open={false} />);
    expect(screen.queryByTestId('cost-confirm-modal')).not.toBeInTheDocument();
  });

  it('renders when open=true with the estimated cost', () => {
    render(<CostConfirmModal {...defaultProps} />);
    expect(screen.getByTestId('cost-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('cost-amount').textContent).toBe('$0.35');
  });

  it('shows "Free" when provider=LOCAL (defensive — shouldn\'t happen in practice)', () => {
    render(<CostConfirmModal {...defaultProps} provider="LOCAL" />);
    expect(screen.getByTestId('cost-amount').textContent).toBe('Free');
  });

  it('shows "< $0.01" for sub-cent costs', () => {
    render(<CostConfirmModal {...defaultProps} estimatedCostUsd={0.003} />);
    expect(screen.getByTestId('cost-amount').textContent).toBe('< $0.01');
  });

  it('calls onApprove when the Approve button is clicked', () => {
    render(<CostConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('cost-confirm-approve'));
    expect(defaultProps.onApprove).toHaveBeenCalledOnce();
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the Cancel button is clicked', () => {
    render(<CostConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Cancel run'));
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
    expect(defaultProps.onApprove).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', () => {
    render(<CostConfirmModal {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the backdrop is clicked', () => {
    render(<CostConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('cost-confirm-modal'));
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  it('does NOT call onCancel when clicking inside the modal content', () => {
    render(<CostConfirmModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Approve & Run'));
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });

  it('has proper accessibility attributes (role, aria-modal, aria-labelledby)', () => {
    render(<CostConfirmModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'cost-confirm-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'cost-confirm-desc');
  });
});
