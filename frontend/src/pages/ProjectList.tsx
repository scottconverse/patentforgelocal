import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Project } from '../types';
import Alert from '../components/Alert';
import ConfirmModal from '../components/ConfirmModal';
import { statusColors } from '../utils/statusColors';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ProjectList() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.projects.list();
      setProjects(data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      setTitleError('Project title is required.');
      return;
    }
    setTitleError(null);
    try {
      setCreating(true);
      const project = await api.projects.create(newTitle.trim());
      setProjects((prev) => [project, ...prev]);
      setNewTitle('');
      setShowNewForm(false);
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(project: Project) {
    setDeleteTarget(project);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      setDeletingId(deleteTarget.id);
      setDeleteTarget(null);
      await api.projects.delete(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    } catch (e: any) {
      setError(e.message || 'Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Projects</h1>
          <p className="text-gray-400 text-sm mt-1">Manage your patent feasibility analyses</p>
        </div>
        <button
          onClick={() => setShowNewForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Project
        </button>
      </div>

      {/* New project form */}
      {showNewForm && (
        <form
          onSubmit={handleCreate}
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowNewForm(false); setNewTitle(''); } }}
          className="mb-6 p-4 bg-gray-900 border border-gray-700 rounded-lg"
        >
          <label className="block text-sm font-medium text-gray-300 mb-2">Project Title</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => { setNewTitle(e.target.value); setTitleError(null); }}
              placeholder="e.g. AI-Powered Patent Claim Analyzer"
              autoFocus
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewForm(false);
                setNewTitle('');
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
          {titleError && (
            <p className="mt-2 text-sm text-red-400">{titleError}</p>
          )}
        </form>
      )}

      {/* Error */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <span
            className="w-6 h-6 rounded-full border-2 border-gray-600 border-t-blue-500 animate-spin mr-3"
            aria-label="Loading"
          />
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-lg font-medium text-gray-400">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-gray-100 truncate">{project.title}</h3>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[project.status] || 'bg-gray-700 text-gray-300'}`}
                  >
                    {project.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Created {formatDate(project.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                >
                  Open
                </button>
                <button
                  onClick={() => handleDelete(project)}
                  disabled={deletingId === project.id}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
                >
                  {deletingId === project.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Project"
          message={`Delete "${deleteTarget.title}"? All analysis data, claims, compliance results, and patent application drafts will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
