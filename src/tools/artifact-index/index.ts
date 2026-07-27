// src/tools/artifact-index/index.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import initSqlJs, { Database } from "sql.js";

const DEFAULT_DB_DIR = join(homedir(), ".config", "opencode", "artifact-index");
const DB_NAME = "context.db";
const ERR_DB_NOT_INITIALIZED = "Database not initialized";
const DEFAULT_SEARCH_LIMIT = 10;

let sqlPromise: Promise<{ Database: new (data?: Uint8Array) => Database }> | null = null;

function getSqlJs(): Promise<{ Database: new (data?: Uint8Array) => Database }> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => "sql-wasm.wasm" });
  }
  return sqlPromise;
}

export interface PlanRecord {
  readonly id: string;
  readonly title?: string;
  readonly filePath: string;
  readonly overview?: string;
  readonly approach?: string;
}

export interface LedgerRecord {
  readonly id: string;
  readonly sessionName?: string;
  readonly filePath: string;
  readonly goal?: string;
  readonly stateNow?: string;
  readonly keyDecisions?: string;
  readonly filesRead?: string;
  readonly filesModified?: string;
}

export interface MilestoneArtifactRecord {
  readonly id: string;
  readonly milestoneId: string;
  readonly artifactType: string;
  readonly sourceSessionId?: string;
  readonly createdAt?: string;
  readonly tags?: string[];
  readonly payload: string;
}

export interface SearchResult {
  readonly type: "plan" | "ledger";
  readonly id: string;
  readonly filePath: string;
  readonly title?: string;
  readonly summary?: string;
  readonly score: number;
}

export interface MilestoneArtifactSearchResult {
  readonly type: "milestone";
  readonly id: string;
  readonly milestoneId: string;
  readonly artifactType: string;
  readonly sourceSessionId?: string;
  readonly createdAt?: string;
  readonly tags: string[];
  readonly payload: string;
  readonly score: number;
}

const PLANS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY, title TEXT, file_path TEXT UNIQUE NOT NULL,
    overview TEXT, approach TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS plans_fts USING fts5(id, title, overview, approach);`;

const LEDGERS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS ledgers (
    id TEXT PRIMARY KEY, session_name TEXT, file_path TEXT UNIQUE NOT NULL,
    goal TEXT, state_now TEXT, key_decisions TEXT, files_read TEXT, files_modified TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS ledgers_fts USING fts5(id, session_name, goal, state_now, key_decisions);`;

const MILESTONE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS milestone_artifacts (
    id TEXT PRIMARY KEY, milestone_id TEXT NOT NULL, artifact_type TEXT NOT NULL,
    source_session_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tags TEXT, payload TEXT NOT NULL, indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS milestone_artifacts_fts USING fts5(
    id, milestone_id, artifact_type, payload, tags, source_session_id
  );`;

function getInlineSchema(): string {
  return [PLANS_SCHEMA, LEDGERS_SCHEMA, MILESTONE_SCHEMA].join("\n");
}

function escapeFtsQuery(query: string): string {
  return query
    .replace(/['"]/g, "")
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => `"${term}"`)
    .join(" OR ");
}

function requireDb(db: Database | null): Database {
  if (!db) throw new Error(ERR_DB_NOT_INITIALIZED);
  return db;
}

function saveDb(db: Database, dbPath: string): void {
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

function getFirstColumnValue(result: { columns: string[]; values: unknown[][] }, col: number = 0): unknown | null {
  if (result.values.length > 0 && result.values[0].length > col) {
    return result.values[0][col];
  }
  return null;
}

function indexPlanInDb(db: Database, record: PlanRecord): void {
  const existing = db.exec(`SELECT id FROM plans WHERE file_path = ?`, [record.filePath]);
  if (existing.length > 0) {
    const id = getFirstColumnValue(existing[0]);
    if (id) {
      db.run(`DELETE FROM plans_fts WHERE id = ?`, [id as string]);
    }
  }

  db.run(
    `INSERT INTO plans (id, title, file_path, overview, approach, indexed_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(file_path) DO UPDATE SET
       id = excluded.id, title = excluded.title,
       overview = excluded.overview, approach = excluded.approach,
       indexed_at = CURRENT_TIMESTAMP`,
    [record.id, record.title ?? null, record.filePath, record.overview ?? null, record.approach ?? null],
  );

  db.run(`INSERT INTO plans_fts (id, title, overview, approach) VALUES (?, ?, ?, ?)`, [
    record.id,
    record.title ?? null,
    record.overview ?? null,
    record.approach ?? null,
  ]);
}

function indexLedgerInDb(db: Database, record: LedgerRecord): void {
  const existing = db.exec(`SELECT id FROM ledgers WHERE file_path = ?`, [record.filePath]);
  if (existing.length > 0) {
    const id = getFirstColumnValue(existing[0]);
    if (id) {
      db.run(`DELETE FROM ledgers_fts WHERE id = ?`, [id as string]);
    }
  }

  db.run(
    `INSERT INTO ledgers (id, session_name, file_path, goal, state_now, key_decisions, files_read, files_modified, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(file_path) DO UPDATE SET
       id = excluded.id, session_name = excluded.session_name,
       goal = excluded.goal, state_now = excluded.state_now,
       key_decisions = excluded.key_decisions, files_read = excluded.files_read,
       files_modified = excluded.files_modified, indexed_at = CURRENT_TIMESTAMP`,
    [
      record.id,
      record.sessionName ?? null,
      record.filePath,
      record.goal ?? null,
      record.stateNow ?? null,
      record.keyDecisions ?? null,
      record.filesRead ?? null,
      record.filesModified ?? null,
    ],
  );

  db.run(`INSERT INTO ledgers_fts (id, session_name, goal, state_now, key_decisions) VALUES (?, ?, ?, ?, ?)`, [
    record.id,
    record.sessionName ?? null,
    record.goal ?? null,
    record.stateNow ?? null,
    record.keyDecisions ?? null,
  ]);
}

function searchPlans(db: Database, escapedQuery: string, limit: number): SearchResult[] {
  const plans = db.exec(
    `SELECT p.id, p.file_path, p.title, rank
     FROM plans_fts
     JOIN plans p ON plans_fts.id = p.id
     WHERE plans_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [escapedQuery, limit],
  );

  if (plans.length === 0) return [];

  return plans[0].values.map((row) => ({
    type: "plan" as const,
    id: row[0] as string,
    filePath: row[1] as string,
    title: row[2] as string | undefined,
    score: -(row[3] as number),
  }));
}

function searchLedgers(db: Database, escapedQuery: string, limit: number): SearchResult[] {
  const ledgers = db.exec(
    `SELECT l.id, l.file_path, l.session_name, l.goal, rank
     FROM ledgers_fts
     JOIN ledgers l ON ledgers_fts.id = l.id
     WHERE ledgers_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [escapedQuery, limit],
  );

  if (ledgers.length === 0) return [];

  return ledgers[0].values.map((row) => ({
    type: "ledger" as const,
    id: row[0] as string,
    filePath: row[1] as string,
    title: row[2] as string | undefined,
    summary: row[3] as string | undefined,
    score: -(row[4] as number),
  }));
}

interface MilestoneRow {
  id: string;
  milestone_id: string;
  artifact_type: string;
  source_session_id: string | null;
  created_at: string | null;
  tags: string | null;
  payload: string;
  rank: number;
}

function searchMilestoneArtifactsInDb(
  db: Database,
  escapedQuery: string,
  milestoneId: string | null,
  artifactType: string | null,
  limit: number,
): MilestoneArtifactSearchResult[] {
  const rows = db.exec(
    `SELECT
      milestone_artifacts.id,
      milestone_artifacts.milestone_id,
      milestone_artifacts.artifact_type,
      milestone_artifacts.source_session_id,
      milestone_artifacts.created_at,
      milestone_artifacts.tags,
      milestone_artifacts.payload,
      milestone_artifacts_fts.rank
    FROM milestone_artifacts_fts
    JOIN milestone_artifacts ON milestone_artifacts.id = milestone_artifacts_fts.id
    WHERE milestone_artifacts_fts MATCH ?
      AND (? IS NULL OR milestone_artifacts.milestone_id = ?)
      AND (? IS NULL OR milestone_artifacts.artifact_type = ?)
    ORDER BY milestone_artifacts_fts.rank
    LIMIT ?`,
    [escapedQuery, milestoneId, milestoneId, artifactType, artifactType, limit],
  );

  if (rows.length === 0) return [];

  return rows[0].values.map((row) => ({
    type: "milestone" as const,
    id: row[0] as string,
    milestoneId: row[1] as string,
    artifactType: row[2] as string,
    sourceSessionId: row[3] as string | undefined,
    createdAt: row[4] as string | undefined,
    tags: row[5] ? (JSON.parse(row[5] as string) as string[]) : [],
    payload: row[6] as string,
    score: -(row[7] as number),
  }));
}

function indexMilestoneArtifactInDb(db: Database, record: MilestoneArtifactRecord): void {
  const tags = JSON.stringify(record.tags ?? []);
  const createdAt = record.createdAt ?? new Date().toISOString();
  const existing = db.exec(`SELECT id FROM milestone_artifacts WHERE id = ?`, [record.id]);

  if (existing.length > 0) {
    const id = getFirstColumnValue(existing[0]);
    if (id) {
      db.run(`DELETE FROM milestone_artifacts_fts WHERE id = ?`, [id as string]);
    }
  }

  db.run(
    `INSERT INTO milestone_artifacts (
        id, milestone_id, artifact_type, source_session_id,
        created_at, tags, payload, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        milestone_id = excluded.milestone_id,
        artifact_type = excluded.artifact_type,
        source_session_id = excluded.source_session_id,
        created_at = excluded.created_at,
        tags = excluded.tags,
        payload = excluded.payload,
        indexed_at = CURRENT_TIMESTAMP`,
    [
      record.id,
      record.milestoneId,
      record.artifactType,
      record.sourceSessionId ?? null,
      createdAt,
      tags,
      record.payload,
    ],
  );

  db.run(
    `INSERT INTO milestone_artifacts_fts (
        id, milestone_id, artifact_type, payload, tags, source_session_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    [record.id, record.milestoneId, record.artifactType, record.payload, tags, record.sourceSessionId ?? ""],
  );
}

export interface ArtifactIndex {
  initialize(): Promise<void>;
  indexPlan(record: PlanRecord): Promise<void>;
  indexLedger(record: LedgerRecord): Promise<void>;
  search(query: string, limit?: number): Promise<SearchResult[]>;
  indexMilestoneArtifact(record: MilestoneArtifactRecord): Promise<void>;
  searchMilestoneArtifacts(
    query: string,
    options?: { milestoneId?: string; artifactType?: string; limit?: number },
  ): Promise<MilestoneArtifactSearchResult[]>;
  close(): Promise<void>;
}

export async function createArtifactIndex(dbDir: string = DEFAULT_DB_DIR): Promise<ArtifactIndex> {
  const SQL = await getSqlJs();
  let db: Database | null = null;
  const dbPath = join(dbDir, DB_NAME);

  async function initializeDb(): Promise<void> {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(dbPath)) {
      const fileBuffer = readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    const schemaPath = join(dirname(import.meta.url), "schema.sql");
    let schema: string;
    try {
      schema = readFileSync(schemaPath, "utf-8");
    } catch {
      schema = getInlineSchema();
    }
    db.exec(schema);
  }

  return {
    async initialize(): Promise<void> {
      await initializeDb();
    },
    async indexPlan(record: PlanRecord): Promise<void> {
      indexPlanInDb(requireDb(db), record);
      saveDb(requireDb(db), dbPath);
    },
    async indexLedger(record: LedgerRecord): Promise<void> {
      indexLedgerInDb(requireDb(db), record);
      saveDb(requireDb(db), dbPath);
    },
    async search(query: string, limit: number = DEFAULT_SEARCH_LIMIT): Promise<SearchResult[]> {
      const escapedQuery = escapeFtsQuery(query);
      const results = [
        ...searchPlans(requireDb(db), escapedQuery, limit),
        ...searchLedgers(requireDb(db), escapedQuery, limit),
      ];
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    },
    async indexMilestoneArtifact(record: MilestoneArtifactRecord): Promise<void> {
      indexMilestoneArtifactInDb(requireDb(db), record);
      saveDb(requireDb(db), dbPath);
    },
    async searchMilestoneArtifacts(
      query: string,
      options: { milestoneId?: string; artifactType?: string; limit?: number } = {},
    ): Promise<MilestoneArtifactSearchResult[]> {
      return searchMilestoneArtifactsInDb(
        requireDb(db),
        escapeFtsQuery(query),
        options.milestoneId ?? null,
        options.artifactType ?? null,
        options.limit ?? DEFAULT_SEARCH_LIMIT,
      );
    },
    async close(): Promise<void> {
      if (db) {
        db.close();
        db = null;
      }
    },
  };
}

// Singleton instance for global use
let globalIndex: ArtifactIndex | null = null;

export async function getArtifactIndex(): Promise<ArtifactIndex> {
  if (!globalIndex) {
    globalIndex = await createArtifactIndex();
    await globalIndex.initialize();
  }
  return globalIndex;
}