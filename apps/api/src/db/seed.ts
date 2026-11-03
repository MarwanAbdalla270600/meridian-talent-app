/**
 * Idempotent seed: skill catalog, one user per role (only if SEED_*_PASSWORD is set),
 * and optional fictional demo data (SEED_DEMO_DATA=true). Never hardcodes passwords.
 */
import type { Role } from '@meridian/shared';
import { sql } from 'drizzle-orm';
import { hashPassword, passwordWeakness } from '../lib/passwords';
import { createDb, type Db } from './client';
import { seedDemoData } from './seed-demo';
import { skills, users } from './schema';
import { SKILL_CATALOG } from './skill-catalog';

export async function seedSkills(db: Db) {
  for (const s of SKILL_CATALOG) {
    await db
      .insert(skills)
      .values({ name: s.name, category: s.category, aliases: s.aliases ?? [], status: 'approved' })
      .onConflictDoNothing();
  }
}

export async function seedUser(
  db: Db,
  role: Role,
  email: string,
  password: string,
  displayName: string,
) {
  const weak = passwordWeakness(password);
  if (weak) throw new Error(`Seed password for ${role} rejected (${weak})`);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  if (existing.length) return existing[0]!.id;
  const [u] = await db
    .insert(users)
    .values({ email, role, displayName, passwordHash: await hashPassword(password), locale: 'de' })
    .returning({ id: users.id });
  return u!.id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const { db, sql: client } = createDb(url, 1);
  try {
    await seedSkills(db);
    const defs: [Role, string, string][] = [
      ['admin', 'SEED_ADMIN', 'Admin'],
      ['austria_reviewer', 'SEED_AUSTRIA', 'Prüfer Österreich'],
      ['egypt_editor', 'SEED_EGYPT', 'Erfassung Ägypten'],
    ];
    const ids: Partial<Record<Role, string>> = {};
    for (const [role, prefix, name] of defs) {
      const email = process.env[`${prefix}_EMAIL`];
      const password = process.env[`${prefix}_PASSWORD`];
      if (email && password) ids[role] = await seedUser(db, role, email, password, name);
    }
    if (process.env.SEED_DEMO_DATA === 'true') {
      if (process.env.NODE_ENV === 'production')
        throw new Error('Demo data must not be seeded in production');
      await seedDemoData(db, ids);
    }
    console.log(JSON.stringify({ level: 'info', msg: 'seed complete', users: Object.keys(ids) }));
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(JSON.stringify({ level: 'error', msg: 'seed failed', error: String(err) }));
    process.exit(1);
  });
}
