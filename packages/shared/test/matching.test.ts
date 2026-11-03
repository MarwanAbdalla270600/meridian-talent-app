import { describe, expect, test } from 'bun:test';
import {
  formatBelowLevel,
  normalizeSkillName,
  rankDevelopers,
  scoreDeveloper,
  type MatchDeveloper,
  type MatchRequest,
} from '../src';

const sk = (skillId: string, name: string, level: number, aliases: string[] = []) => ({
  skillId,
  name,
  level,
  aliases,
});
const rq = (skillId: string, name: string, minLevel: number) => ({ skillId, name, minLevel });

const req: MatchRequest = {
  seniority: 'senior',
  startBy: '2026-12-01',
  skills: [
    rq('java', 'Java', 4),
    rq('spring', 'Spring Boot', 4),
    rq('ng', 'Angular', 3),
    rq('aws', 'AWS', 3),
  ],
};

const dev = (over: Partial<MatchDeveloper> = {}): MatchDeveloper => ({
  id: 'd1',
  status: 'P2_FREIGEGEBEN',
  seniority: 'mid',
  availableFrom: null,
  skills: [
    sk('java', 'Java', 5),
    sk('spring', 'Spring Boot', 5),
    sk('ng', 'Angular', 4),
    sk('aws', 'AWS', 3),
  ],
  ...over,
});

describe('scoreDeveloper', () => {
  test('perfect match is 100 %', () => {
    expect(scoreDeveloper(dev(), req).score).toBe(100);
  });
  test('higher level than required does not over-count', () => {
    const r = scoreDeveloper(dev(), req);
    expect(r.missing).toEqual([]);
    expect(r.belowLevel).toEqual([]);
  });
  test('missing skill counts 0 and is listed', () => {
    const d = dev({
      skills: [sk('java', 'Java', 4), sk('spring', 'Spring Boot', 4), sk('ng', 'Angular', 3)],
    });
    const r = scoreDeveloper(d, req);
    expect(r.score).toBe(Math.round((11 / 14) * 100));
    expect(r.missing).toEqual(['AWS']);
  });
  test('too low level is listed as Skill (actual/required)', () => {
    const d = dev({
      skills: [
        sk('java', 'Java', 2),
        sk('spring', 'Spring Boot', 4),
        sk('ng', 'Angular', 3),
        sk('aws', 'AWS', 3),
      ],
    });
    const r = scoreDeveloper(d, req);
    expect(r.score).toBe(Math.round((12 / 14) * 100));
    expect(r.belowLevel.map(formatBelowLevel)).toEqual(['Java (2/4)']);
  });
  test('seniority bonus is small and capped at 100', () => {
    const d = dev({
      seniority: 'senior',
      skills: [sk('java', 'Java', 4), sk('spring', 'Spring Boot', 4), sk('ng', 'Angular', 3)],
    });
    expect(scoreDeveloper(d, req).score).toBe(Math.round((11 / 14 + 0.04) * 100));
    expect(scoreDeveloper(dev({ seniority: 'senior' }), req).score).toBe(100);
  });
  test('late availability is multiplied by 0.85', () => {
    const r = scoreDeveloper(dev({ availableFrom: '2027-01-15' }), req);
    expect(r.score).toBe(85);
    expect(r.availableInTime).toBe(false);
  });
  test('availability on the start date is in time', () => {
    expect(scoreDeveloper(dev({ availableFrom: '2026-12-01' }), req).availableInTime).toBe(true);
  });
  test('request without skills scores 0', () => {
    expect(scoreDeveloper(dev(), { ...req, skills: [], seniority: null }).score).toBe(0);
  });
  test('aliases and spellings are normalised across different catalog ids', () => {
    const r = scoreDeveloper(
      dev({ skills: [sk('x1', 'K8s', 4), sk('x2', 'postgres', 4), sk('x3', 'Node.js', 4)] }),
      {
        seniority: null,
        startBy: null,
        skills: [rq('k', 'Kubernetes', 4), rq('p', 'PostgreSQL', 4), rq('n', 'NodeJS', 4)],
      },
    );
    expect(r.score).toBe(100);
  });
});

describe('normalizeSkillName', () => {
  test.each([
    ['Node.js', 'node'],
    ['node js', 'node'],
    ['C#', 'csharp'],
    ['.NET', 'dotnet'],
    ['CI/CD', 'cicd'],
    ['Spring Boot', 'springboot'],
    ['React.js', 'react'],
  ])('%s -> %s', (a, b) => expect(normalizeSkillName(a)).toBe(b));
  test('Java and JavaScript stay different', () => {
    expect(normalizeSkillName('Java')).not.toBe(normalizeSkillName('JavaScript'));
  });
});

describe('rankDevelopers', () => {
  test('only Pool 2 developers are considered', () => {
    const list = [
      dev({ id: 'a', status: 'P1_IN_ERFASSUNG' }),
      dev({ id: 'b', status: 'P1_EINGEREICHT' }),
      dev({ id: 'c' }),
    ];
    expect(rankDevelopers(list, req).map((r) => r.developerId)).toEqual(['c']);
  });
  test('sorted by score, then earlier availability', () => {
    const list = [
      dev({ id: 'low', skills: [sk('java', 'Java', 1)] }),
      dev({ id: 'later', availableFrom: '2026-11-20' }),
      dev({ id: 'now', availableFrom: null }),
    ];
    expect(rankDevelopers(list, req).map((r) => r.developerId)).toEqual(['now', 'later', 'low']);
  });
});
