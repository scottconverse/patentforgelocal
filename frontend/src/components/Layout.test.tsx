import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout navbar', () => {
  it('renders Projects and Settings nav links', () => {
    renderAt('/');
    expect(screen.getByText('Projects')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('Projects link is active on /', () => {
    renderAt('/');
    const link = screen.getByText('Projects');
    expect(link.className).toContain('text-blue-400');
  });

  it('Projects link is active on /projects/abc', () => {
    renderAt('/projects/abc');
    const link = screen.getByText('Projects');
    expect(link.className).toContain('text-blue-400');
  });

  it('Settings link is active on /settings', () => {
    renderAt('/settings');
    const link = screen.getByText('Settings');
    expect(link.className).toContain('text-blue-400');
  });

  it('Projects link is not active on /settings', () => {
    renderAt('/settings');
    const link = screen.getByText('Projects');
    expect(link.className).not.toContain('text-blue-400');
  });
});
