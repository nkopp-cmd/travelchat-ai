/**
 * Minimal D1Database shim over node:sqlite for tests. Better Auth detects it as D1
 * (prepare + batch + exec), so tests run the same Kysely D1 dialect as the Worker.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

type Value = string | number | bigint | null | Uint8Array;

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: Value[] = []) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map((p) =>
      p instanceof Date ? p.toISOString() : typeof p === "boolean" ? (p ? 1 : 0) : (p as Value)));
  }
  async all<T = Record<string, unknown>>() {
    const statement = this.db.prepare(this.sql);
    if (/^\s*(select|pragma|with)\b/i.test(this.sql) || /\breturning\b/i.test(this.sql)) {
      const results = statement.all(...this.params) as T[];
      return { results, success: true, meta: { changes: 0, last_row_id: null } };
    }
    const info = statement.run(...this.params);
    return { results: [] as T[], success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
  async run() { return this.all(); }
  async first<T = Record<string, unknown>>() { return ((await this.all<T>()).results[0] ?? null) as T | null; }
}

export class D1Sqlite {
  readonly sqlite: DatabaseSync;
  constructor(file = ":memory:") { this.sqlite = new DatabaseSync(file); }
  prepare(sql: string) { return new Statement(this.sqlite, sql); }
  async batch(statements: Statement[]) { return Promise.all(statements.map((s) => s.all())); }
  async exec(sql: string) { this.sqlite.exec(sql); return { count: 1, duration: 0 }; }
}

export function createAuthTestDatabase(file?: string): D1Sqlite {
  const d1 = new D1Sqlite(file);
  const dir = path.resolve(__dirname, "../../migrations/auth");
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    d1.sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
  }
  return d1;
}
