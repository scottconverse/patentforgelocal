import { ReactNode } from 'react';

const VARIANTS = {
  error: 'bg-red-900/40 border-red-800 text-red-300',
  warning: 'bg-amber-900/30 border-amber-800 text-amber-300',
  info: 'bg-blue-900/30 border-blue-800 text-blue-300',
  success: 'bg-green-900/40 border-green-800 text-green-300',
} as const;

interface AlertProps {
  variant: keyof typeof VARIANTS;
  children: ReactNode;
  className?: string;
}

export default function Alert({ variant, children, className = '' }: AlertProps) {
  return (
    <div className={`p-3 border rounded-lg text-sm ${VARIANTS[variant]} ${className}`} role="alert">
      {children}
    </div>
  );
}
