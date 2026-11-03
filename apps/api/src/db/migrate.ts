/** Applies pending migrations. Run as a separate step/container before the API starts. */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, sql } = createDb(url, 1);
try {
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  console.log(JSON.stringify({ level: 'info', msg: 'migrations applied' }));
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'migration failed', error: String(err) }));
  process.exitCode = 1;
} finally {
  await sql.end();
}
