import os from 'os';
import fs from 'fs';
import path from 'path';
import { ContextManager } from '../src/context-manager';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
}

function cleanupDir(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

describe('ContextManager', () => {
  let tmpDir: string;
  let dbPath: string;
  let mgr: ContextManager;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    dbPath = path.join(tmpDir, 'test.db');
    mgr = await ContextManager.create(dbPath);
  });

  afterEach(() => {
    try {
      mgr.close();
    } catch {
      // Already closed
    }
    cleanupDir(tmpDir);
  });

  test('index and retrieve full stage output', () => {
    mgr.indexStageOutput(1, 'Stage One', 'This is the output of stage one.');

    const output = mgr.getFullOutput(1);
    expect(output).toBe('This is the output of stage one.');
  });

  test('returns null for missing stage', () => {
    const output = mgr.getFullOutput(99);
    expect(output).toBeNull();
  });

  test('overwrites on re-index', () => {
    mgr.indexStageOutput(1, 'Stage One', 'Original output');
    mgr.indexStageOutput(1, 'Stage One Updated', 'New output');

    const output = mgr.getFullOutput(1);
    expect(output).toBe('New output');
  });

  test('search finds relevant content across stages', () => {
    mgr.indexStageOutput(1, 'Intake', 'The invention relates to wireless charging technology for electric vehicles.');
    mgr.indexStageOutput(2, 'Prior Art', 'Several patents exist for inductive charging systems in automotive applications.');
    mgr.indexStageOutput(3, 'Analysis', 'The novelty lies in the adaptive frequency modulation approach.');

    const results = mgr.searchRelevant(['charging technology']);
    expect(results.length).toBeGreaterThan(0);
    // Should find content mentioning charging
    const hasCharging = results.some((r) => r.content.toLowerCase().includes('charging'));
    expect(hasCharging).toBe(true);
  });

  test('buildStageContext includes all prior outputs for stages 1-3', () => {
    mgr.indexStageOutput(1, 'Intake', 'Stage 1 output text');
    mgr.indexStageOutput(2, 'Prior Art', 'Stage 2 output text');

    // Building context for stage 3 should include stages 1 and 2
    const context = mgr.buildStageContext(3, []);
    expect(context.size).toBe(2);
    expect(context.get(1)).toBe('Stage 1 output text');
    expect(context.get(2)).toBe('Stage 2 output text');
  });

  test('buildStageContext for stage 1 returns empty map (no prior stages)', () => {
    const context = mgr.buildStageContext(1, []);
    expect(context.size).toBe(0);
  });

  test('buildStageContext uses search for stages 4+', () => {
    mgr.indexStageOutput(1, 'Intake', 'The invention involves a novel battery management system.');
    mgr.indexStageOutput(2, 'Prior Art', 'Existing battery management patents from Samsung and LG.');
    mgr.indexStageOutput(3, 'Analysis', 'The adaptive thermal regulation is the key differentiator.');
    mgr.indexStageOutput(4, 'Deep Dive', 'Deep analysis of the battery thermal management approach.');

    // Stage 5 context: full stage 4 + search results from earlier
    const context = mgr.buildStageContext(5, ['battery management']);

    // Must include full previous stage (4)
    expect(context.get(4)).toBe('Deep analysis of the battery thermal management approach.');

    // Should have search results from earlier stages about battery management
    // At minimum stage 4 is present; search may add stages 1-3
    expect(context.size).toBeGreaterThanOrEqual(1);
  });

  test('clear removes all data', () => {
    mgr.indexStageOutput(1, 'Intake', 'Some content');
    mgr.indexStageOutput(2, 'Prior Art', 'More content');

    mgr.clear();

    expect(mgr.getFullOutput(1)).toBeNull();
    expect(mgr.getFullOutput(2)).toBeNull();
    expect(mgr.searchRelevant(['content']).length).toBe(0);
  });

  test('chunks long text at paragraph boundaries', () => {
    // Create text with multiple paragraphs, total > 2000 chars
    const paragraphs: string[] = [];
    for (let i = 0; i < 20; i++) {
      paragraphs.push(
        `Paragraph ${i}: ${`This is a moderately long sentence about patent analysis that adds content to the chunk. `.repeat(3)}`,
      );
    }
    const longText = paragraphs.join('\n\n');

    mgr.indexStageOutput(1, 'Long Stage', longText);

    // Verify the full output is preserved
    const fullOutput = mgr.getFullOutput(1);
    expect(fullOutput).toBe(longText);

    // Verify search works across chunks — search for a term in a later paragraph
    const results = mgr.searchRelevant(['Paragraph 15']);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.content.includes('Paragraph 15'))).toBe(true);
  });

  test('persists data to disk and reloads', async () => {
    mgr.indexStageOutput(1, 'Persist Test', 'Data to persist');
    mgr.close();

    // Re-open from same path
    const mgr2 = await ContextManager.create(dbPath);
    try {
      const output = mgr2.getFullOutput(1);
      expect(output).toBe('Data to persist');
    } finally {
      mgr2.close();
    }
  });
});
