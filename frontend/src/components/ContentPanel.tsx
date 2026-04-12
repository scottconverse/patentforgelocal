import { ReactNode } from 'react';
import { ViewMode } from '../hooks/useProjectDetail';

/**
 * Shared wrapper for tab content panels (Claims, Compliance, Application,
 * Prior Art, Invention Form). Provides the dark card container, a heading,
 * and a contextual back button.
 */
export default function ContentPanel({
  title,
  isPipelineStreaming,
  onBack,
  children,
}: {
  title: string;
  isPipelineStreaming: boolean;
  onBack: (target: ViewMode) => void;
  children: ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        <button
          onClick={() => onBack(isPipelineStreaming ? 'running' : 'overview')}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          &larr; Back
        </button>
      </div>
      {children}
    </div>
  );
}
