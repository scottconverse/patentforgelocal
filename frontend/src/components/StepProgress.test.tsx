import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StepProgress, {
  CLAIMS_STEPS,
  COMPLIANCE_STEPS,
  APPLICATION_STEPS,
  StepState,
  StepDef,
} from './StepProgress';

describe('StepProgress', () => {
  const steps: StepDef[] = [
    { key: 'a', label: 'Step A', activeLabel: 'Running A...', completeLabel: 'A done' },
    { key: 'b', label: 'Step B', activeLabel: 'Running B...', completeLabel: 'B done' },
    { key: 'c', label: 'Step C', activeLabel: 'Running C...', completeLabel: 'C done' },
  ];

  it('renders all steps in pending state', () => {
    const states: StepState[] = [
      { key: 'a', status: 'pending' },
      { key: 'b', status: 'pending' },
      { key: 'c', status: 'pending' },
    ];

    render(<StepProgress steps={steps} stepStates={states} />);

    expect(screen.getByTestId('step-a')).toHaveTextContent('Step A');
    expect(screen.getByTestId('step-b')).toHaveTextContent('Step B');
    expect(screen.getByTestId('step-c')).toHaveTextContent('Step C');
  });

  it('shows complete label for completed steps', () => {
    const states: StepState[] = [
      { key: 'a', status: 'complete' },
      { key: 'b', status: 'running' },
      { key: 'c', status: 'pending' },
    ];

    render(<StepProgress steps={steps} stepStates={states} />);

    expect(screen.getByTestId('step-a')).toHaveTextContent('A done');
    expect(screen.getByTestId('step-b')).toHaveTextContent('Running B...');
    expect(screen.getByTestId('step-c')).toHaveTextContent('Step C');
  });

  it('shows active label for running step', () => {
    const states: StepState[] = [
      { key: 'a', status: 'complete' },
      { key: 'b', status: 'running' },
      { key: 'c', status: 'pending' },
    ];

    render(<StepProgress steps={steps} stepStates={states} />);

    expect(screen.getByTestId('step-b')).toHaveTextContent('Running B...');
  });

  it('renders status icons with correct aria labels', () => {
    const states: StepState[] = [
      { key: 'a', status: 'complete' },
      { key: 'b', status: 'running' },
      { key: 'c', status: 'pending' },
    ];

    render(<StepProgress steps={steps} stepStates={states} />);

    expect(screen.getByLabelText('Complete')).toBeInTheDocument();
    expect(screen.getByLabelText('Running')).toBeInTheDocument();
    expect(screen.getByLabelText('Pending')).toBeInTheDocument();
  });

  it('shows error status correctly', () => {
    const states: StepState[] = [
      { key: 'a', status: 'complete' },
      { key: 'b', status: 'error', detail: 'Something failed' },
      { key: 'c', status: 'pending' },
    ];

    render(<StepProgress steps={steps} stepStates={states} />);

    expect(screen.getByLabelText('Error')).toBeInTheDocument();
    expect(screen.getByTestId('step-b')).toHaveTextContent('Something failed');
  });

  it('shows elapsed time when provided', () => {
    const states: StepState[] = [{ key: 'a', status: 'running' }];
    render(<StepProgress steps={[steps[0]]} stepStates={states} elapsed="1m 30s" />);

    expect(screen.getByText('1m 30s elapsed')).toBeInTheDocument();
  });

  it('shows description when provided', () => {
    const states: StepState[] = [{ key: 'a', status: 'pending' }];
    render(
      <StepProgress steps={[steps[0]]} stepStates={states} description="Takes 2-5 minutes." />,
    );

    expect(screen.getByText('Takes 2-5 minutes.')).toBeInTheDocument();
  });

  it('shows error message when provided', () => {
    const states: StepState[] = [{ key: 'a', status: 'error' }];
    render(
      <StepProgress steps={[steps[0]]} stepStates={states} error="Generation failed" />,
    );

    expect(screen.getByText('Generation failed')).toBeInTheDocument();
  });

  it('renders with data-testid on root element', () => {
    const states: StepState[] = [{ key: 'a', status: 'pending' }];
    render(<StepProgress steps={[steps[0]]} stepStates={states} />);

    expect(screen.getByTestId('step-progress')).toBeInTheDocument();
  });
});

describe('Step definitions', () => {
  it('CLAIMS_STEPS has 3 steps with correct keys', () => {
    expect(CLAIMS_STEPS).toHaveLength(3);
    expect(CLAIMS_STEPS.map((s) => s.key)).toEqual(['plan', 'draft', 'examine']);
  });

  it('COMPLIANCE_STEPS has 4 steps with correct keys', () => {
    expect(COMPLIANCE_STEPS).toHaveLength(4);
    expect(COMPLIANCE_STEPS.map((s) => s.key)).toEqual([
      'eligibility',
      'definiteness',
      'written_description',
      'formalities',
    ]);
  });

  it('APPLICATION_STEPS has 5 steps with correct keys', () => {
    expect(APPLICATION_STEPS).toHaveLength(5);
    expect(APPLICATION_STEPS.map((s) => s.key)).toEqual([
      'background',
      'summary',
      'detailed_description',
      'abstract',
      'figures',
    ]);
  });

  it('all step definitions have required properties', () => {
    const allSteps = [...CLAIMS_STEPS, ...COMPLIANCE_STEPS, ...APPLICATION_STEPS];
    for (const step of allSteps) {
      expect(step.key).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.activeLabel).toBeTruthy();
      expect(step.completeLabel).toBeTruthy();
    }
  });
});
