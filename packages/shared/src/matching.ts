import type { DeveloperStatus, Seniority } from './enums';

/** Bonus (absolute fraction) when the developer seniority equals the requested one. */
export const SENIORITY_BONUS = 0.04;
/** Factor applied when the developer becomes available only after the requested start. */
export const LATE_AVAILABILITY_FACTOR = 0.85;

const ALIASES: Record<string, string> = {
  js: 'javascript',
  ecmascript: 'javascript',
  ts: 'typescript',
  k8s: 'kubernetes',
  postgres: 'postgresql',
  psql: 'postgresql',
  pg: 'postgresql',
  golang: 'go',
  reactjs: 'react',
  vuejs: 'vue',
  nodejs: 'node',
  node: 'node',
  nextjs: 'next',
  springboot: 'springboot',
  dotnet: 'dotnet',
  csharpdotnet: 'dotnet',
  csharp: 'csharp',
  mssql: 'sqlserver',
  microsoftsqlserver: 'sqlserver',
  amazonwebservices: 'aws',
  googlecloud: 'gcp',
  googlecloudplatform: 'gcp',
  microsoftazure: 'azure',
  abap: 'sapabap',
  fiori: 'sapfiori',
  ror: 'rubyonrails',
  rails: 'rubyonrails',
  cicd: 'cicd',
  continuousintegration: 'cicd',
};

/**
 * Normalises a skill spelling so that e.g. "Node.js", "node js" and "NodeJS"
 * compare equal. Symbols with meaning (C#, C++, .NET) are mapped first.
 */
export function normalizeSkillName(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s
    .replace(/c#/g, 'csharp')
    .replace(/c\+\+/g, 'cpp')
    .replace(/\.net\b/g, 'dotnet');
  s = s.replace(/f#/g, 'fsharp');
  s = s.replace(/[\s._\-/()]+/g, '');
  return ALIASES[s] ?? s;
}

export interface MatchSkillRef {
  skillId: string;
  name: string;
  aliases?: readonly string[];
}

export interface MatchDeveloperSkill extends MatchSkillRef {
  level: number;
}

export interface MatchRequestSkill extends MatchSkillRef {
  minLevel: number;
}

export interface MatchDeveloper {
  id: string;
  status: DeveloperStatus;
  seniority: Seniority;
  /** ISO date (YYYY-MM-DD); `null` means available immediately. */
  availableFrom: string | null;
  skills: readonly MatchDeveloperSkill[];
}

export interface MatchRequest {
  seniority: Seniority | null;
  /** ISO date (YYYY-MM-DD); `null` means no deadline. */
  startBy: string | null;
  skills: readonly MatchRequestSkill[];
}

export interface MatchResult {
  developerId: string;
  /** 0–100 */
  score: number;
  /** Requested skills the developer does not have at all. */
  missing: string[];
  /** Requested skills the developer has, but below the minimum level. */
  belowLevel: { name: string; actual: number; required: number }[];
  seniorityMatch: boolean;
  availableInTime: boolean;
}

function keysOf(ref: MatchSkillRef): Set<string> {
  const keys = new Set<string>([`id:${ref.skillId}`, normalizeSkillName(ref.name)]);
  for (const a of ref.aliases ?? []) keys.add(normalizeSkillName(a));
  return keys;
}

function findSkill(
  devSkills: readonly MatchDeveloperSkill[],
  wanted: MatchRequestSkill,
): MatchDeveloperSkill | undefined {
  const wantedKeys = keysOf(wanted);
  let best: MatchDeveloperSkill | undefined;
  for (const s of devSkills) {
    for (const k of keysOf(s)) {
      if (wantedKeys.has(k)) {
        if (!best || s.level > best.level) best = s;
        break;
      }
    }
  }
  return best;
}

/**
 * Score = Σ min(devLevel, minLevel) / Σ minLevel, plus a small seniority bonus
 * (capped at 100 %), times 0.85 if the developer is available only after the
 * requested start date.
 */
export function scoreDeveloper(dev: MatchDeveloper, req: MatchRequest): MatchResult {
  let total = 0;
  let got = 0;
  const missing: string[] = [];
  const belowLevel: MatchResult['belowLevel'] = [];

  for (const wanted of req.skills) {
    total += wanted.minLevel;
    const has = findSkill(dev.skills, wanted);
    if (!has) {
      missing.push(wanted.name);
      continue;
    }
    got += Math.min(has.level, wanted.minLevel);
    if (has.level < wanted.minLevel) {
      belowLevel.push({ name: wanted.name, actual: has.level, required: wanted.minLevel });
    }
  }

  let p = total > 0 ? got / total : 0;
  const seniorityMatch = req.seniority !== null && dev.seniority === req.seniority;
  if (seniorityMatch) p = Math.min(1, p + SENIORITY_BONUS);

  const availableInTime =
    req.startBy === null || dev.availableFrom === null || dev.availableFrom <= req.startBy;
  if (!availableInTime) p *= LATE_AVAILABILITY_FACTOR;

  return {
    developerId: dev.id,
    score: Math.round(p * 100),
    missing,
    belowLevel,
    seniorityMatch,
    availableInTime,
  };
}

/** Ranks only Pool 2 (approved) developers, best match first. */
export function rankDevelopers(devs: readonly MatchDeveloper[], req: MatchRequest): MatchResult[] {
  return devs
    .filter((d) => d.status === 'P2_FREIGEGEBEN')
    .map((d) => ({ d, r: scoreDeveloper(d, req) }))
    .sort((a, b) => {
      if (b.r.score !== a.r.score) return b.r.score - a.r.score;
      const aa = a.d.availableFrom ?? '';
      const bb = b.d.availableFrom ?? '';
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    })
    .map((x) => x.r);
}

/** Formats a below-level entry as "Skill (actual/required)". */
export const formatBelowLevel = (b: { name: string; actual: number; required: number }): string =>
  `${b.name} (${b.actual}/${b.required})`;
