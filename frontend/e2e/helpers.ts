/**
 * E2E test helpers — create/delete projects via API for fast setup/teardown.
 */

const API_BASE = 'http://localhost:3000/api';

export async function createProject(title: string): Promise<string> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
  const data = await res.json();
  return data.id;
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
}

export async function getSettings(): Promise<any> {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
}

export async function updateSettings(data: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateInvention(projectId: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/projects/${projectId}/invention`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
