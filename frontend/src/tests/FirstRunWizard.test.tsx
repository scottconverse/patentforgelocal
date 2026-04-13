import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirstRunWizard from '../components/FirstRunWizard';

vi.mock('../api', () => ({
  api: {
    settings: {
      get: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../components/SystemCheck', () => ({
  default: ({ onPass }: { onPass: (result: { modelDownloaded: boolean }) => void }) => (
    <div data-testid="system-check">
      <button onClick={() => onPass({ modelDownloaded: false })}>System OK</button>
    </div>
  ),
}));

vi.mock('../components/ModelDownload', () => ({
  default: ({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) => (
    <div data-testid="model-download">
      <button onClick={onComplete}>Download Complete</button>
      <button onClick={onSkip}>Skip Download</button>
    </div>
  ),
}));

import { api } from '../api';

describe('FirstRunWizard', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders welcome step with PatentForgeLocal branding', () => {
    render(<FirstRunWizard onComplete={mockOnComplete} />);
    expect(screen.getByText(/Welcome to PatentForgeLocal/i)).toBeTruthy();
    expect(screen.getByText(/Get Started/i)).toBeTruthy();
    expect(screen.getByText(/100% Private/i)).toBeTruthy();
  });

  it('advances from welcome to system-check on Get Started click', () => {
    render(<FirstRunWizard onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByText(/Get Started/i));
    expect(screen.getByTestId('system-check')).toBeTruthy();
  });

  it('advances through system-check to model-download when model not downloaded', () => {
    render(<FirstRunWizard onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByText(/Get Started/i));
    fireEvent.click(screen.getByText(/System OK/i));
    expect(screen.getByTestId('model-download')).toBeTruthy();
  });

  it('shows optional API keys step after model download', () => {
    render(<FirstRunWizard onComplete={mockOnComplete} />);
    fireEvent.click(screen.getByText(/Get Started/i));
    fireEvent.click(screen.getByText(/System OK/i));
    fireEvent.click(screen.getByText(/Download Complete/i));
    expect(screen.getByText(/Optional API Keys/i)).toBeTruthy();
    expect(screen.getByText(/Skip for Now/i)).toBeTruthy();
  });

  it('saves settings and calls onComplete on finish', async () => {
    render(<FirstRunWizard onComplete={mockOnComplete} />);
    // Navigate through all steps
    fireEvent.click(screen.getByText(/Get Started/i));
    fireEvent.click(screen.getByText(/System OK/i));
    fireEvent.click(screen.getByText(/Download Complete/i));
    fireEvent.click(screen.getByText(/Skip for Now/i)); // skip API keys
    fireEvent.click(screen.getByText(/I Understand/i)); // disclaimer
    fireEvent.click(screen.getByText(/Start Using PatentForgeLocal/i));

    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalledWith(true);
    });
  });
});
