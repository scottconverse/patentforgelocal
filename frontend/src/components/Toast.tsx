import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  detail?: string;
  type?: 'success' | 'error' | 'info';
  duration?: number; // ms, default 6000
  onClose: () => void;
}

export default function Toast({ message, detail, type = 'success', duration = 6000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // wait for fade-out
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const colors = {
    success: 'bg-green-900 border-green-700 text-green-200',
    error: 'bg-red-900 border-red-700 text-red-200',
    info: 'bg-blue-900 border-blue-700 text-blue-200',
  }[type];

  const icon = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
  }[type];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 max-w-sm border rounded-lg px-4 py-3 shadow-xl transition-opacity duration-300 ${colors} ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg font-bold leading-none mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{message}</p>
          {detail && <p className="text-xs opacity-75 mt-0.5 break-all">{detail}</p>}
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onClose, 300);
          }}
          className="text-current opacity-50 hover:opacity-100 text-lg leading-none ml-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}
