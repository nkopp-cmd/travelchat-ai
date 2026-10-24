// Supabase exit step 2: translate a pinned Postgres catalog snapshot (columns, constraints,
// indexes; no rows) into D1/SQLite DDL. Anything the rules below do not understand throws,
// so no constraint is dropped silently. Rules that cannot be kept in SQLite are listed in
// the generated file header and must be enforced by the repository layer.
//
//   node scripts/d1-migration/pg-to-d1-schema.mjs <schema.json> > migrations/app-preview/00NN_x.sql
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Supabase `users` rows become D1 `profiles` (same uuid, see core-import.mjs).
const TABLE_RENAMES = { users: "profiles" };
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const UUID_V4 = "(lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||" +
  "substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))))";
const JSON_TYPES = { object: "'object'", array: "'array'", string: "'text'", boolean: "('true','false')", number: "('integer','real')" };
// The only regular expressions in the source schema; each has an exact GLOB equivalent.
const REGEX_GLOB = {
  "^[A-Z]{2}$": c => `(length(${c}) = 2 AND ${c} NOT GLOB '*[^A-Z]*')`,
  "^[A-Z]{3}$": c => `(length(${c}) = 3 AND ${c} NOT GLOB '*[^A-Z]*')`,
  "^[a-z0-9]+(?:-[a-z0-9]+)*$": c => `(length(${c}) > 0 AND ${c} NOT GLOB '*[^a-z0-9-]*' AND ${c} NOT GLOB '-*' AND ${c} NOT GLOB '*-' AND ${c} NOT GLOB '*--*')`,
};

const ident = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unexpected identifier: ${name}`);
  return name;
};

/** Column type and value-shape check for one Postgres udt. Geography points split into _lat/_lng. */
function columnDefs(col) {
  const name = ident(col.col);
  const notNull = col.nul === "NO" ? " NOT NULL" : "";
  const def = defaultFor(col);
  const one = (type, check) => [`${name} ${type}${notNull}${def}${check ? ` CHECK (${check})` : ""}`];
  switch (col.udt) {
    case "uuid": case "text": case "bpchar": case "varchar": return one("TEXT");
    case "date": return one("TEXT", `${name} IS NULL OR (length(${name}) = 10 AND date(${name}) = ${name})`);
    case "timestamptz": return one("TEXT", `${name} IS NULL OR julianday(${name}) IS NOT NULL`);
    case "int2": case "int4": case "int8": return one("INTEGER", `${name} IS NULL OR typeof(${name}) = 'integer'`);
    case "float8": case "numeric": return one("REAL", `${name} IS NULL OR typeof(${name}) IN ('integer','real')`);
    case "bool": return one("INTEGER", `${name} IS NULL OR ${name} IN (0,1)`);
    case "jsonb": return one("TEXT", `${name} IS NULL OR json_valid(${name})`);
    case "_text": return one("TEXT", `${name} IS NULL OR (json_valid(${name}) AND json_type(${name}) = 'array')`);
    case "geography": return [
      `${name}_lat REAL${notNull} CHECK (${name}_lat IS NULL OR ${name}_lat BETWEEN -90 AND 90)`,
      `${name}_lng REAL${notNull} CHECK (${name}_lng IS NULL OR ${name}_lng BETWEEN -180 AND 180)`,
    ];
    // MultiPolygon boundaries are kept as GeoJSON text; nothing queries them spatially today.
    case "geometry": return [`${name}_geojson TEXT${notNull} CHECK (${name}_geojson IS NULL OR json_valid(${name}_geojson))`];
    default: throw new Error(`Unsupported type ${col.udt} on ${col.t}.${name}`);
  }
}

function defaultFor(col) {
  const d = col.def;
  if (d === null || d === undefined) return "";
  if (d === "gen_random_uuid()") return ` DEFAULT ${UUID_V4}`;
  if (d === "now()") return ` DEFAULT ${NOW}`;
  const later = d.match(/^\(now\(\) \+ '(\d+) (days|minutes)'::interval\)$/) || d.match(/^\(now\(\) \+ '00:(\d+):00'::interval\)$/);
  if (later) return ` DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+${later[1]} ${later[2] ?? "minutes"}'))`;
  if (d === "true" || d === "false") return ` DEFAULT ${d === "true" ? 1 : 0}`;
  if (/^-?\d+(\.\d+)?$/.test(d)) return ` DEFAULT ${d}`;
  if (d === "'{}'::text[]") return " DEFAULT '[]'";
  // UTC dates, as Supabase's CURRENT_DATE.
  if (d === "CURRENT_DATE") return " DEFAULT (date('now'))";
  if (d === "(date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date") return " DEFAULT (date('now','start of month'))";
  const literal = d.match(/^'((?:[^']|'')*)'::(text|jsonb|character varying)$/);
  if (literal) return ` DEFAULT '${literal[1]}'`;
  throw new Error(`Unsupported default ${d} on ${col.t}.${col.col}`);
}

/** Rewrite one Postgres boolean expression into SQLite; throws on anything left unknown. */
export function translateExpression(expr) {
  let s = expr;
  s = s.replace(/\(\((\w+) ~ '([^']+)'::text\)\)/g, (_, c, re) => {
    const glob = REGEX_GLOB[re];
    if (!glob) throw new Error(`Unsupported regex ${re}`);
    return `(${glob(ident(c))})`;
  });
  s = s.replace(/jsonb_typeof\((\w+)\) = ANY \(ARRAY\[([^\]]+)\]\)/g, (_, c, list) => {
    const types = list.split(",").map(v => v.trim().match(/^'(\w+)'::text$/)?.[1]);
    if (types.some(t => !JSON_TYPES[t])) throw new Error(`Unsupported jsonb type list ${list}`);
    return `json_type(${ident(c)}) IN (${types.map(t => JSON_TYPES[t].replace(/^\(|\)$/g, "")).join(", ")})`;
  });
  s = s.replace(/(\w+) = ANY \(ARRAY\[([^\]]+)\]\)/g, (_, c, list) => `${ident(c)} IN (${list})`);
  s = s.replace(/jsonb_typeof\((\w+)\) = '(\w+)'::text/g, (_, c, t) => {
    const mapped = JSON_TYPES[t];
    if (!mapped) throw new Error(`Unsupported jsonb type ${t}`);
    return mapped.startsWith("(") ? `json_type(${ident(c)}) IN ${mapped}` : `json_type(${ident(c)}) = ${mapped}`;
  });
  s = s.replace(/\((\w+) \? '([\w-]+)'::text\)/g, (_, c, k) => `(json_type(${ident(c)}, '$.${k}') IS NOT NULL)`);
  s = s.replace(/num_nonnulls\(([\w, ]+)\)/g, (_, list) =>
    `(${list.split(",").map(c => `(${ident(c.trim())} IS NOT NULL)`).join(" + ")})`);
  s = s.replace(/TRIM\(BOTH FROM (\w+)\)/g, "trim($1)").replace(/\bbtrim\(/g, "trim(").replace(/\bchar_length\(/g, "length(");
  s = s.replace(/::(text|numeric|integer|bigint|smallint|double precision)\b/g, "");
  if (/::|~|\bANY\b|\bARRAY\b|jsonb|\bnow\(\)|interval|::regclass|\?\s/.test(s)) throw new Error(`Untranslated expression: ${expr}`);
  return s;
}

function constraintSql(con) {
  const def = con.def;
  const cols = list => list.split(",").map(c => ident(c.trim())).join(", ");
  let m;
  if ((m = def.match(/^PRIMARY KEY \(([^)]+)\)$/))) return `PRIMARY KEY (${cols(m[1])})`;
  if ((m = def.match(/^UNIQUE \(([^)]+)\)$/))) return `UNIQUE (${cols(m[1])})`;
  if ((m = def.match(/^FOREIGN KEY \(([^)]+)\) REFERENCES (\w+)\(([^)]+)\)( ON DELETE (CASCADE|SET NULL|RESTRICT))?$/))) {
    const target = TABLE_RENAMES[m[2]] ?? ident(m[2]);
    return `FOREIGN KEY (${cols(m[1])}) REFERENCES ${target}(${cols(m[3])})${m[4] ?? ""}`;
  }
  if ((m = def.match(/^CHECK (.+)$/))) return `CHECK ${translateExpression(m[1])}`;
  throw new Error(`Unsupported constraint ${con.conname}: ${def}`);
}

function indexSql(index, geoColumns) {
  const m = index.indexdef.match(/^CREATE (UNIQUE )?INDEX (\w+) ON public\.(\w+) USING (btree|gist|gin) \((.+?)\)( WHERE (.+))?$/);
  if (!m) throw new Error(`Unsupported index ${index.indexname}`);
  const [, unique = "", name, table, method, columns, , where] = m;
  if (method === "gin") throw new Error(`GIN index ${name} has no D1 equivalent`);
  if (method === "gist") {
    const geo = geoColumns.get(`${table}.${columns}`);
    if (!geo) throw new Error(`GiST index ${name} is not on a geography point`);
    return `CREATE INDEX ${ident(name)} ON ${ident(table)} (${columns}_lat, ${columns}_lng);`;
  }
  const cols = columns.split(",").map(c => {
    const part = c.trim().match(/^(\w+)( DESC| ASC)?$/) || c.trim().match(/^lower\((\w+)\)()$/);
    if (!part) throw new Error(`Unsupported index column ${c} in ${name}`);
    return c.trim().startsWith("lower(") ? `lower(${ident(part[1])})` : `${ident(part[1])}${part[2] ?? ""}`;
  }).join(", ");
  return `CREATE ${unique}INDEX ${ident(name)} ON ${ident(table)} (${cols})${where ? ` WHERE ${translateExpression(where)}` : ""};`;
}

/** FK-safe order: a table comes after every table it references (self references allowed). */
export function tableOrder(schema) {
  return orderTables([...new Set(schema.columns.map(c => c.t))], schema.constraints);
}

function orderTables(tables, constraints) {
  const deps = new Map(tables.map(t => [t, new Set()]));
  for (const c of constraints) {
    const m = c.def.match(/REFERENCES (\w+)\(/);
    if (m && deps.has(m[1]) && m[1] !== c.t) deps.get(c.t).add(m[1]);
  }
  const done = [], seen = new Set();
  const visit = (t, path = new Set()) => {
    if (seen.has(t)) return;
    if (path.has(t)) throw new Error(`FK cycle at ${t}`);
    path.add(t);
    for (const d of [...deps.get(t)].sort()) visit(d, path);
    seen.add(t); done.push(t);
  };
  for (const t of [...tables].sort()) visit(t);
  return done;
}

/** Read-only Postgres SELECT that returns one table's rows already in the D1 value shapes above. */
export function sourceSelect(schema, table) {
  const cols = schema.columns.filter(c => c.t === table);
  if (!cols.length) throw new Error(`Unknown table ${table}`);
  const parts = cols.flatMap(col => {
    const c = `"${ident(col.col)}"`;
    switch (col.udt) {
      case "geography": return [`ST_Y(${c}::geometry) AS ${col.col}_lat`, `ST_X(${c}::geometry) AS ${col.col}_lng`];
      case "geometry": return [`ST_AsGeoJSON(${c}) AS ${col.col}_geojson`];
      // Exactly the text PostgREST returns (e.g. 2026-07-05T03:23:09.541946+00:00), so D1 rows equal API rows.
      case "timestamptz": return [`to_json(${c}) #>> '{}' AS ${col.col}`];
      case "date": return [`${c}::text AS ${col.col}`];
      case "bool": return [`${c}::int AS ${col.col}`];
      case "numeric": return [`${c}::float8 AS ${col.col}`];
      case "jsonb": case "_text": return [`to_json(${c})::text AS ${col.col}`];
      default: return [`${c} AS ${col.col}`];
    }
  });
  return `SELECT ${parts.join(", ")} FROM public."${ident(table)}"`;
}

export function translateSchema(schema) {
  const tables = [...new Set(schema.columns.map(c => c.t))];
  const geoColumns = new Map(schema.columns.filter(c => c.udt === "geography").map(c => [`${c.t}.${c.col}`, true]));
  const out = [
    "-- Generated by scripts/d1-migration/pg-to-d1-schema.mjs from a pinned Supabase catalog snapshot.",
    `-- Source: ${schema.source}`,
    "-- Types: uuid/text/date/timestamptz -> TEXT (ISO 8601), jsonb/text[] -> JSON TEXT, bool -> 0/1,",
    "-- geography point -> <col>_lat/<col>_lng REAL, geometry -> <col>_geojson TEXT. users(id) -> profiles(id).",
    "-- Row-level security does not exist in D1: owner scoping lives in the repository layer.",
  ];
  for (const t of orderTables(tables, schema.constraints)) {
    const cols = schema.columns.filter(c => c.t === t).flatMap(columnDefs);
    const cons = schema.constraints.filter(c => c.t === t).map(constraintSql);
    out.push(`CREATE TABLE ${ident(t)} (\n  ${[...cols, ...cons].join(",\n  ")}\n);`);
    for (const index of schema.indexes.filter(i => i.t === t)) out.push(indexSql(index, geoColumns));
  }
  return out.join("\n") + "\n";
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(translateSchema(JSON.parse(readFileSync(process.argv[2], "utf8"))));
}
