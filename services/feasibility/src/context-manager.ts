import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

interface SearchResult {
  stageNumber: number;
  content: string;
  rank: number;
}

export class ContextManager {
  private db: SqlJsDatabase;
  private dbPath: string;

  private constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  /**
   * Create a new ContextManager. Loads or creates the SQLite database at dbPath.
   * sql.js requires async WASM initialization, so this is a static factory.
   */
  static async create(dbPath: string): Promise<ContextManager> {
    const SQL = await initSqlJs();

    let db: SqlJsDatabase;
    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    db.run('PRAGMA journal_mode = WAL;');

    db.run(`
      CREATE TABLE IF NOT EXISTS stage_outputs (
        stage_number INTEGER PRIMARY KEY,
        stage_name TEXT NOT NULL,
        output TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );
    `);

    // sql.js bundles FTS5 support in the default WASM build
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS stage_chunks USING fts5(
        stage_number,
        chunk_index,
        content,
        tokenize='porter'
      );
    `);

    const mgr = new ContextManager(db, dbPath);
    mgr.persist();
    return mgr;
  }

  /** Write the in-memory database to disk. */
  private persist(): void {
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  /**
   * Index a stage's output: upsert the raw output and chunk it into FTS5
   * for later search. Chunks at ~2000 char paragraph boundaries.
   */
  indexStageOutput(stageNumber: number, stageName: string, output: string): void {
    const now = new Date().toISOString();

    // Upsert raw output
    this.db.run(
      `INSERT INTO stage_outputs (stage_number, stage_name, output, indexed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(stage_number) DO UPDATE SET
         stage_name = excluded.stage_name,
         output = excluded.output,
         indexed_at = excluded.indexed_at`,
      [stageNumber, stageName, output, now],
    );

    // Remove old chunks for this stage
    this.db.run(
      `DELETE FROM stage_chunks WHERE stage_number = ?`,
      [String(stageNumber)],
    );

    // Insert new chunks
    const chunks = this.chunkText(output, 2000);
    for (let i = 0; i < chunks.length; i++) {
      this.db.run(
        `INSERT INTO stage_chunks (stage_number, chunk_index, content)
         VALUES (?, ?, ?)`,
        [String(stageNumber), String(i), chunks[i]],
      );
    }

    this.persist();
  }

  /** Retrieve the full raw output for a stage, or null if not indexed. */
  getFullOutput(stageNumber: number): string | null {
    const stmt = this.db.prepare(
      `SELECT output FROM stage_outputs WHERE stage_number = ?`,
    );
    stmt.bind([stageNumber]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return (row.output as string) ?? null;
    }
    stmt.free();
    return null;
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
        const stmt = this.db.prepare(`
          SELECT stage_number, content, rank
          FROM stage_chunks
          WHERE stage_chunks MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        stmt.bind([sanitized, limit]);

        while (stmt.step()) {
          const row = stmt.getAsObject() as {
            stage_number: string;
            content: string;
            rank: number;
          };
          const key = `${row.stage_number}:${(row.content as string).slice(0, 50)}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              stageNumber: Number(row.stage_number),
              content: row.content as string,
              rank: row.rank,
            });
          }
        }
        stmt.free();
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
      const stmt = this.db.prepare(
        `SELECT stage_number, output FROM stage_outputs
         WHERE stage_number < ?
         ORDER BY stage_number`,
      );
      stmt.bind([currentStage]);

      while (stmt.step()) {
        const row = stmt.getAsObject() as { stage_number: number; output: string };
        context.set(row.stage_number, row.output);
      }
      stmt.free();
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
    this.db.run('DELETE FROM stage_outputs');
    this.db.run('DELETE FROM stage_chunks');
    this.persist();
  }

  /** Close the database connection and persist to disk. */
  close(): void {
    this.persist();
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
