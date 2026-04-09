import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
let _pool: pg.Pool | undefined;

export function getDb(databaseUrl: string) {
  if (!_db) {
    _pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 20,
    });
    _db = drizzle(_pool, { schema });
  }
  return _db;
}

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
    _db = undefined;
  }
}

export * from "./schema/index.js";
export { schema };
