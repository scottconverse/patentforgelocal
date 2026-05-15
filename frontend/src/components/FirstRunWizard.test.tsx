import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import FirstRunWizard from './FirstRunWizard';

// Mock the API so handleFinish's settings.update doesn't fire a real fetch.
const updateMock = vi.fn().mockResolvedValue({});
vi.mock('../api', () => ({
  api: {
    settings: {
      update: (payload: unknown) => updateMock(payload),
    },
  },
}));

// Mock SystemCheck and ModelDownload so the wizard's LOCAL flow can be
// driven without their real network calls. Each stub renders a button the
// test clicks to simulate the success path.
vi.mock('./SystemCheck', () => ({
  default: ({ onPass }: { onPass: (r: { modelDownloaded: boolean }) => void }) => (
    <button
      type="button"
      data-testid="system-check-pass"
      onClick={() => onPass({ modelDownloaded: false })}
    >
      [stub] system-check pass
    </button>
  ),
}));

vi.mock('./ModelDownload', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button
      type="button"
      data-testid="model-download-complete"
      onClick={() => onComplete()}
    >
      [stub] model-download complete
    </button>
  ),
}));

describe('FirstRunWizard — Run 6 edition-aware branching', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    onComplete.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Lean install path ────────────────────────────────────────────────────

  describe('Lean install (no Ollama bundle)', () => {
    it('opens with a cloud-only welcome and skips the chooser', () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Lean" />);
      expect(screen.getByText('Welcome to PatentForge')).toBeInTheDocument();
      expect(screen.getByText(/Cloud Mode/)).toBeInTheDocument();
      // The chooser is NOT rendered in Lean
      expect(screen.queryByText('Pick a mode')).not.toBeInTheDocument();
    });

    it('flows welcome → cloud-api-key → disclaimer → ready and saves provider=CLOUD', async () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Lean" />);

      // 1. welcome
      fireEvent.click(screen.getByText('Get Started'));

      // 2. cloud-api-key — fill the field
      const cloudKeyInput = screen.getByLabelText(/Anthropic API Key/i) as HTMLInputElement;
      fireEvent.change(cloudKeyInput, { target: { value: 'sk-ant-test-lean' } });
      fireEvent.click(screen.getByText('Continue'));

      // 3. disclaimer
      expect(screen.getByText('Important Notice')).toBeInTheDocument();
      fireEvent.click(screen.getByText('I Understand'));

      // 4. ready → finish
      expect(screen.getByText("You're All Set")).toBeInTheDocument();
      fireEvent.click(screen.getByText('Start Using PatentForge'));

      await waitFor(() => expect(updateMock).toHaveBeenCalledOnce());
      const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.provider).toBe('CLOUD');
      expect(payload.cloudApiKey).toBe('sk-ant-test-lean');
      expect(payload.modelReady).toBe(true);
      // Lean must not send ollamaApiKey
      expect(payload).not.toHaveProperty('ollamaApiKey');

      await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true));
    });

    it('does NOT render system-check or model-download in Lean', () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Lean" />);
      fireEvent.click(screen.getByText('Get Started'));
      // Now on cloud-api-key
      expect(screen.queryByTestId('system-check-pass')).not.toBeInTheDocument();
      expect(screen.queryByTestId('model-download-complete')).not.toBeInTheDocument();
    });
  });

  // ── Full install path ────────────────────────────────────────────────────

  describe('Full install — provider chooser branches', () => {
    it('opens with a neutral welcome and shows the chooser after Get Started', () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Full" />);
      expect(screen.getByText('Welcome to PatentForge')).toBeInTheDocument();
      expect(screen.getByText(/Local or Cloud/i)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Get Started'));
      expect(screen.getByText('Pick a mode')).toBeInTheDocument();
      expect(screen.getByLabelText(/Choose Local mode/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Choose Cloud mode/i)).toBeInTheDocument();
    });

    it('Full + Cloud picks: welcome → chooser → cloud-api-key → disclaimer → ready; provider=CLOUD', async () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Full" />);

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.click(screen.getByLabelText(/Choose Cloud mode/i));

      // Now on cloud-api-key
      const cloudKeyInput = screen.getByLabelText(/Anthropic API Key/i) as HTMLInputElement;
      fireEvent.change(cloudKeyInput, { target: { value: 'sk-ant-test-full' } });
      fireEvent.click(screen.getByText('Continue'));

      fireEvent.click(screen.getByText('I Understand'));
      fireEvent.click(screen.getByText('Start Using PatentForge'));

      await waitFor(() => expect(updateMock).toHaveBeenCalledOnce());
      const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.provider).toBe('CLOUD');
      expect(payload.cloudApiKey).toBe('sk-ant-test-full');
      expect(payload.modelReady).toBe(true);
      expect(payload).not.toHaveProperty('ollamaApiKey');
    });

    it('Full + Local picks: welcome → chooser → system-check → model-download → ollama-account → disclaimer → ready; provider=LOCAL', async () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Full" />);

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.click(screen.getByLabelText(/Choose Local mode/i));

      // SystemCheck stub
      fireEvent.click(screen.getByTestId('system-check-pass'));
      // ModelDownload stub
      fireEvent.click(screen.getByTestId('model-download-complete'));

      // Now on ollama-account
      const ollamaKeyInput = screen.getByLabelText(/Ollama Web Search Key/i) as HTMLInputElement;
      fireEvent.change(ollamaKeyInput, { target: { value: 'ollama-web-key' } });
      fireEvent.click(screen.getByText('Continue'));

      fireEvent.click(screen.getByText('I Understand'));
      fireEvent.click(screen.getByText('Start Using PatentForge'));

      await waitFor(() => expect(updateMock).toHaveBeenCalledOnce());
      const payload = updateMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.provider).toBe('LOCAL');
      expect(payload.ollamaApiKey).toBe('ollama-web-key');
      expect(payload.modelReady).toBe(true);
      expect(payload).not.toHaveProperty('cloudApiKey');
    });

    it('shows Local-mode ready copy when LOCAL was chosen', async () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Full" />);
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.click(screen.getByLabelText(/Choose Local mode/i));
      fireEvent.click(screen.getByTestId('system-check-pass'));
      fireEvent.click(screen.getByTestId('model-download-complete'));
      fireEvent.click(screen.getByText(/Skip for Now|Continue/));
      fireEvent.click(screen.getByText('I Understand'));

      expect(screen.getByText(/ready in Local mode/i)).toBeInTheDocument();
    });

    it('shows Cloud-mode ready copy when CLOUD was chosen', async () => {
      render(<FirstRunWizard onComplete={onComplete} installEdition="Full" />);
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.click(screen.getByLabelText(/Choose Cloud mode/i));
      fireEvent.click(screen.getByText(/Skip for Now|Continue/));
      fireEvent.click(screen.getByText('I Understand'));

      expect(screen.getByText(/ready in Cloud mode/i)).toBeInTheDocument();
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  it('still calls onComplete(true) when settings.update rejects', async () => {
    updateMock.mockRejectedValueOnce(new Error('backend down'));

    render(<FirstRunWizard onComplete={onComplete} installEdition="Lean" />);
    fireEvent.click(screen.getByText('Get Started'));
    fireEvent.click(screen.getByText('Skip for Now'));
    fireEvent.click(screen.getByText('I Understand'));

    await act(async () => {
      fireEvent.click(screen.getByText('Start Using PatentForge'));
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true));
  });
});
