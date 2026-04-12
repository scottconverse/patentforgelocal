import { useState, useEffect, useRef } from 'react';

/**
 * Tracks elapsed seconds while `running` is true.
 * Resets to 0 each time `running` transitions from false → true.
 * Returns elapsed seconds and a formatted string (e.g., "2m 05s").
 */
export function useElapsedTimer(running: boolean): { elapsed: number; formatted: string } {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Intentional: reset to 0 immediately when a new run starts so elapsed shows
    // 0 synchronously on restart — not a cascading-render risk here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    intervalRef.current = id;

    return () => {
      clearInterval(id);
      intervalRef.current = null;
    };
  }, [running]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const formatted = mins > 0 ? `${mins}m ${secs.toString().padStart(2, '0')}s` : `${secs}s`;

  return { elapsed, formatted };
}
