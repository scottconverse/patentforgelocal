import Database from 'better-sqlite3';

interface SearchResult {
  stageNumber: number;
  content: string;
  rank: number;
}

export class ContextManager {
  private db: Database.Database;
  private dbPath: string;

  private constructor(db: Database.Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Create a new ContextManager. Opens or creates the SQLite database at dbPath.
   * Kept as async factory for API compatibility (callers already use `await`).
   */
  static async create(dbPath: string): Promise<ContextManager> {
    const db = new Database(dbPath);

    db.pragma('journal_mode = WAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS stage_outputs (
        stage_number INTEGER PRIMARY KEY,
        stage_name TEXT NOT NULL,
        output TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
    `);

    // better-sqlite3 bundles FTS5 support by default
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS stage_chunks USING fts5(
        stage_number,
        chunk_index,
        content,
        tokenize='porter'
      );
    `);

    return new ContextManager(db, dbPath);
  }

  /**
   * Index a stage's output: upsert the raw output and chunk it into FTS5
   * for later search. Chunks at ~2000 char paragraph boundaries.
   */
  indexStageOutput(stageNumber: number, stageName: string, output: string): void {
    const now = new Date().toISOString();

    // Upsert raw output
    this.db.prepare(
      `INSERT INTO stage_outputs (stage_number, stage_name, output, indexed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(stage_number) DO UPDATE SET
         stage_name = excluded.stage_name,
         output = excluded.output,
         indexed_at = excluded.indexed_at`,
    ).run(stageNumber, stageName, output, now);

    // Remove old chunks for this stage
    this.db.prepare(
      `DELETE FROM stage_chunks WHERE stage_number = ?`,
    ).run(String(stageNumber));

    // Insert new chunks
    const chunks = this.chunkText(output, 2000);
    const insertStmt = this.db.prepare(
      `INSERT INTO stage_chunks (stage_number, chunk_index, content)
       VALUES (?, ?, ?)`,
    );
    for (let i = 0; i < chunks.length; i++) {
      insertStmt.run(String(stageNumber), String(i), chunks[i]);
    }
  }

  /** Retrieve the full raw output for a stage, or null if not indexed. */
  getFullOutput(stageNumber: number): string | null {
    const row = this.db.prepare(
      `SELECT output FROM stage_outputs WHERE stage_number = ?`,
    ).get(stageNumber) as { output: string } | undefined;

    return row?.output ?? null;
  }

  /**
   * Search indexed chunks using FTS5 MATCH for the given queries.
   * Returns the top results ranked by BM25 relevance.
   */
  searchRelevant(queries: string[], limit: number = 10): SearchResult[] {
    if (queries.length === 0) return [];

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      // Sanitize query for FTS5: remove special chars that break MATCH
      const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
      if (!sanitized) continue;

      try {
        const rows = this.db.prepare(`
          SELECT stage_number, content, rank
          FROM stage_chunks
          WHERE stage_chunks MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(sanitized, limit) as Array<{
          stage_number: string;
          content: string;
          rank: number;
        }>;

        for (const row of rows) {
          const key = `${row.stage_number}:${row.content.slice(0, 50)}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              stageNumber: Number(row.stage_number),
              content: row.content,
              rank: row.rank,
            });
          }
        }
      } catch {
        // FTS5 query syntax error -- skip this query
        continue;
      }
    }

    // Sort by rank (lower = more relevant in BM25) and limit
    results.sort((a, b) => a.rank - b.rank);
    return results.slice(0, limit);
  }

  /**
   * Build context for a given stage.
   * - Stages 1-3: returns all prior stage outputs in full.
   * - Stages 4+: returns full previous stage output + search results from earlier stages.
   */
  buildStageContext(
    currentStage: number,
    searchQueries: string[],
    maxChunks: number = 20,
  ): Map<number, string> {
    const context = new Map<number, string>();

    if (currentStage <= 3) {
      // Return all prior stages in full
      const rows = this.db.prepare(
        `SELECT stage_number, output FROM stage_outputs
         WHERE stage_number < ?
         ORDER BY stage_number`,
      ).all(currentStage) as Array<{ stage_number: number; output: string }>;

      for (const row of rows) {
        context.set(row.stage_number, row.output);
      }
    } else {
      // Full previous stage
      const prevOutput = this.getFullOutput(currentStage - 1);
      if (prevOutput) {
        context.set(currentStage - 1, prevOutput);
      }

      // Search results from earlier stages
      if (searchQueries.length > 0) {
        const results = this.searchRelevant(searchQueries, maxChunks);
        for (const result of results) {
          if (result.stageNumber >= currentStage - 1) continue; // skip previous (already full)
          const existing = context.get(result.stageNumber);
          if (existing) {
            context.set(result.stageNumber, existing + '\n\n' + result.content);
          } else {
            context.set(result.stageNumber, result.content);
          }
        }
      }
    }

    return context;
  }

  /** Delete all indexed data. */
  clear(): void {
    this.db.exec('DELETE FROM stage_outputs');
    this.db.exec('DELETE FROM stage_chunks');
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }

  /**
   * Split text into chunks of approximately maxChunkSize characters,
   * breaking at paragraph boundaries (double newlines).
   */
  private chunkText(text: string, maxChunkSize: number): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > maxChunkSize && current.length > 0) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    // Handle case where a single paragraph exceeds maxChunkSize
    if (chunks.length === 0 && text.trim()) {
      chunks.push(text.trim());
    }

    return chunks;
  }
}
