import "server-only";
import { appDataDb, dataBackend } from "./backend";
import { d1Client, TABLES, type D1Role } from "./d1-postgrest";
import { D1_RPCS, d1Rpc } from "./d1-rpc";

/**
 * With DATA_BACKEND=d1, `client.from(<migrated table>)` is answered by the D1 facade with the same role the
 * Supabase client had (service key, user token or anon key); every other table, RPC and storage call still goes
 * to Supabase until its spec lands in d1-postgrest TABLES. Unset (the default) returns the client unchanged.
 */
export function withMigratedTables<T extends object>(client: T, auth: D1Role): T {
  if (dataBackend() !== "d1") return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "rpc" && typeof value === "function") {
        return (name: string, args?: Record<string, unknown>) => {
          // Under D1 an unmigrated function fails loudly instead of silently keeping a Supabase dependency.
          if (!(name in D1_RPCS)) throw new Error(`D1 rpc: function ${name} is not migrated`);
          // The migrated functions are only ever called with the service key.
          if (auth.role !== "service") throw new Error(`D1 rpc: ${name} needs the service role`);
          return d1Rpc(appDataDb(), name, args);
        };
      }
      if (prop !== "from" || typeof value !== "function") return value;
      return (table: string) => {
        if (!(table in TABLES)) return value.call(target, table);
        return d1Client(appDataDb(), auth).from(table);
      };
    },
  });
}
