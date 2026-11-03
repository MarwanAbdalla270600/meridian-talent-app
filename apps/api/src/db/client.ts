import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
/** Transaction handle or database; repository functions accept either. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0] | Db;

export function createDb(url: string, max = 10) {
  const sql = postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    // Keep timestamps as Date and dates as strings (handled by drizzle column modes).
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, sql };
}
