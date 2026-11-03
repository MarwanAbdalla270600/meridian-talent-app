import {
  ERROR_CODES,
  CHECKLIST_KEYS,
  DEVELOPER_STATUSES,
  ROLES,
  REQUEST_STATUSES,
} from '@meridian/shared';
import de from '../../public/i18n/de.json';
import en from '../../public/i18n/en.json';

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const DE = flatten(de as Tree);
const EN = flatten(en as Tree);

describe('translations', () => {
  it('German and English have identical keys', () => {
    expect([...DE.keys()].filter((k) => !EN.has(k))).toEqual([]);
    expect([...EN.keys()].filter((k) => !DE.has(k))).toEqual([]);
  });

  it('no translation is empty', () => {
    expect([...DE].filter(([, v]) => !v.trim())).toEqual([]);
    expect([...EN].filter(([, v]) => !v.trim())).toEqual([]);
  });

  it('every API error code has a message', () => {
    for (const code of ERROR_CODES) {
      expect(DE.has(`errors.${code}`), code).toBe(true);
      expect(EN.has(`errors.${code}`), code).toBe(true);
    }
  });

  it('every enum value used in the UI is translated', () => {
    const keys = [
      ...DEVELOPER_STATUSES.map((s) => `status.${s}`),
      ...ROLES.map((r) => `roles.${r}`),
      ...CHECKLIST_KEYS.map((c) => `checklist.${c}`),
      ...REQUEST_STATUSES.map((s) => `requestStatus.${s}`),
    ];
    for (const k of keys) expect(DE.has(k) && EN.has(k), k).toBe(true);
  });

  it('interpolation placeholders match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of DE) expect(vars(EN.get(k) ?? ''), k).toEqual(vars(v));
  });
});
