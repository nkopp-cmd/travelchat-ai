import "server-only";
import { appDataDb, dataBackend } from "./backend";
import { d1Client, TABLES, type D1Role } from "./d1-postgrest";
import { D1_RPCS, d1Rpc } from "./d1-rpc";

/**
 * With DATA_BACKEND=d1, `client.from(<migrated table>)` is answered by the D1 facade with the same role the
 * Supabase client had (service key, user token or anon key); every other table, RPC and storage call still goes
 * to Supabase until its spec lands in d1-postgrest TABLES. Unset (the default) returns the client unchanged.
 */
const WRITES = new Set(["insert", "upsert", "update", "delete"]);
const FROZEN_ERROR = { code: "25006", message: "Writes are frozen during the database move", details: null, hint: null };

/** A chainable stand-in for a write during the freeze: every chained call returns it, awaiting it yields the error. */
function frozenWrite(): unknown {
  const result = Promise.resolve({ data: null, error: FROZEN_ERROR, count: null, status: 503 });
  const chain: object = new Proxy(() => chain, {
    get: (_target, prop) => prop === "then" ? result.then.bind(result) : () => chain,
  });
  return chain;
}

/** Freeze backstop: writes on a query builder resolve to the frozen error; reads pass through. */
function freezeWrites<B extends object>(builder: B): B {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return typeof prop === "string" && WRITES.has(prop) && typeof value === "function" ? () => frozenWrite() : value;
    },
  });
}

export function withMigratedTables<T extends object>(client: T, auth: D1Role): T {
  // DATA_WRITE_FREEZE (gate 3): middleware already refuses mutating requests; this catches writes made while serving
  // reads (counters, crons) on either backend.
  const frozen = process.env.DATA_WRITE_FREEZE === "true";
  const d1 = dataBackend() === "d1";
  if (!d1 && !frozen) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "rpc" && typeof value === "function") {
        return (name: string, args?: Record<string, unknown>) => {
          if (frozen) return frozenWrite();
          if (!d1) return value.call(target, name, args);
          // Under D1 an unmigrated function fails loudly instead of silently keeping a Supabase dependency.
          if (!(name in D1_RPCS)) throw new Error(`D1 rpc: function ${name} is not migrated`);
          // The migrated functions are only ever called with the service key.
          if (auth.role !== "service") throw new Error(`D1 rpc: ${name} needs the service role`);
          return d1Rpc(appDataDb(), name, args);
        };
      }
      if (prop !== "from" || typeof value !== "function") return value;
      return (table: string) => {
        const builder = d1 && table in TABLES ? d1Client(appDataDb(), auth).from(table) : value.call(target, table);
        return frozen ? freezeWrites(builder) : builder;
      };
    },
  });
}
