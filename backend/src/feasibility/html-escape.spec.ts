/**
 * Tests for HTML injection prevention in exported reports.
 */

import { FeasibilityService } from './feasibility.service';

describe('HTML escape in exports', () => {
  let service: FeasibilityService;

  beforeEach(() => {
    // Create service with mock prisma (we only need the private htmlEscape method)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
    service = new FeasibilityService({} as any);
  });

  it('escapes angle brackets in title', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method
    const escaped = (service as any).htmlEscape('</title><script>alert(1)</script>');
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</title>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('escapes ampersands', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method
    const escaped = (service as any).htmlEscape('AT&T Patent');
    expect(escaped).toBe('AT&amp;T Patent');
  });

  it('escapes double quotes', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method
    const escaped = (service as any).htmlEscape('The "Widget" Patent');
    expect(escaped).toBe('The &quot;Widget&quot; Patent');
  });

  it('leaves safe strings unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method
    const escaped = (service as any).htmlEscape('Normal Patent Title 2024');
    expect(escaped).toBe('Normal Patent Title 2024');
  });

  it('handles empty string', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method
    const escaped = (service as any).htmlEscape('');
    expect(escaped).toBe('');
  });
});
