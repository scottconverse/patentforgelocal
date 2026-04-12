import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElapsedTimer } from './useElapsedTimer';

describe('useElapsedTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when not running', () => {
    const { result } = renderHook(() => useElapsedTimer(false));
    expect(result.current.elapsed).toBe(0);
    expect(result.current.formatted).toBe('0s');
  });

  it('starts counting when running is true', () => {
    const { result } = renderHook(() => useElapsedTimer(true));
    expect(result.current.elapsed).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(3);
    expect(result.current.formatted).toBe('3s');
  });

  it('formats minutes and seconds correctly', () => {
    const { result } = renderHook(() => useElapsedTimer(true));

    act(() => {
      vi.advanceTimersByTime(125000); // 2m 5s
    });
    expect(result.current.elapsed).toBe(125);
    expect(result.current.formatted).toBe('2m 05s');
  });

  it('stops counting when running becomes false', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTimer(running),
      { initialProps: { running: true } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);

    rerender({ running: false });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);
  });

  it('resets to 0 when running restarts', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTimer(running),
      { initialProps: { running: true } },
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);

    rerender({ running: false });
    rerender({ running: true });

    expect(result.current.elapsed).toBe(0);
  });

  it('counts correctly after a cancel-and-restart cycle', () => {
    const { result, rerender } = renderHook(
      ({ running }) => useElapsedTimer(running),
      { initialProps: { running: true } },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(3);

    // Simulate cancel
    rerender({ running: false });
    expect(result.current.elapsed).toBe(3);

    // Simulate restart
    rerender({ running: true });
    expect(result.current.elapsed).toBe(0);

    // Advance 2 seconds — should tick exactly twice, not be stuck at 0
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsed).toBe(2);
  });
});
