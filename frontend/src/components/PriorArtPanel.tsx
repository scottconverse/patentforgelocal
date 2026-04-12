import { useEffect, useRef } from 'react';
import { PriorArtSearch } from '../types';
import Alert from './Alert';

interface PriorArtPanelProps {
  projectId: string;
  search: PriorArtSearch | null;
  onUpdate: (search: PriorArtSearch) => void;
  onPatentClick?: (patentNumber: string) => void;
}

function RelevanceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-gray-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function PriorArtPanel({ projectId, search, onUpdate, onPatentClick }: PriorArtPanelProps) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Open SSE stream if search is running or pending
    if (!search || search.status === 'RUNNING' || search.status === 'PENDING') {
      const es = new EventSource(`/api/projects/${projectId}/prior-art/stream`);
      esRef.current = es;

      const refresh = () => {
        fetch(`/api/projects/${projectId}/prior-art`)
          .then((r) => r.json())
          .then((data) => onUpdate(data))
          .catch(() => {});
      };

      es.addEventListener('prior_art_complete', refresh);
      es.addEventListener('prior_art_error', refresh);
      es.addEventListener('prior_art_queries', refresh);

      return () => {
        es.close();
        esRef.current = null;
      };
    }
  }, [projectId, search?.status]);

  const queries: string[] = (() => {
    try {
      return search?.query ? JSON.parse(search.query) : [];
    } catch {
      return [];
    }
  })();

  if (!search || search.status === 'NONE') {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-sm">
        <p>Prior art search will run automatically when analysis starts.</p>
      </div>
    );
  }

  if (search.status === 'RUNNING' || search.status === 'PENDING') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-800 rounded-lg">
          <span
            className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0"
            aria-label="Loading"
          />
          <div>
            <p className="text-sm font-medium text-blue-300">Searching USPTO patent database...</p>
            {queries.length > 0 && <p className="text-xs text-gray-400 mt-0.5">Queries: {queries.join(' · ')}</p>}
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-800 rounded w-1/4 mb-3" />
              <div className="h-2 bg-gray-800 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (search.status === 'ERROR') {
    return (
      <Alert variant="warning">
        <p className="font-semibold">Structured prior art search unavailable</p>
        <p className="mt-2">
          Add a{' '}
          <a href="/settings" className="text-blue-400 hover:underline">
            USPTO Open Data Portal API key
          </a>{' '}
          in Settings to enable structured patent search results with assignees, CPC codes, and filing dates.
        </p>
        <p className="text-gray-400 mt-2">
          The feasibility analysis still uses AI web search for prior art research (Stage 2).
        </p>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">
            {search.results.length} patent{search.results.length !== 1 ? 's' : ''} found
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Source: {search.results[0]?.source === 'USPTO ODP' ? 'USPTO Open Data Portal' : 'USPTO PatentsView'} ·{' '}
            {search.completedAt ? new Date(search.completedAt).toLocaleString() : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`/api/projects/${projectId}/prior-art/export/csv`, '_blank')}
            className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          >
            Export CSV
          </button>
          <span className="text-xs px-2 py-0.5 bg-green-900 text-green-300 rounded-full">Complete</span>
        </div>
      </div>

      {/* Queries used */}
      {queries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {queries.map((q, i) => (
            <span key={i} className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-full text-gray-300">
              {q}
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {search.results.length === 0 ? (
        <p className="text-sm text-gray-500">No relevant patents found for this invention.</p>
      ) : (
        <div className="space-y-3">
          {search.results.map((result) => (
            <div
              key={result.id}
              onClick={() => onPatentClick?.(result.patentNumber)}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2 cursor-pointer hover:border-blue-700 hover:bg-blue-950/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-blue-400 font-mono">{result.patentNumber}</span>
                <RelevanceBar score={result.relevanceScore} />
              </div>
              <p className="text-sm text-gray-200 leading-snug">{result.title}</p>
              {(result.snippet || result.abstract) && (
                <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">
                  {result.snippet || result.abstract?.slice(0, 200)}
                </p>
              )}
              <p className="text-xs text-blue-600">Click for details</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
