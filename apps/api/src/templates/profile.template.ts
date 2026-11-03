import type { Locale, PdfOptions, Seniority } from '@meridian/shared';
import type { DeveloperAggregate } from '../modules/developers/developer.repository';
import { brand, documentShell, escapeHtml as e } from './brand';

const LABELS = {
  de: {
    profile: 'Entwicklerprofil',
    ref: 'Kennung',
    developer: 'Entwickler',
    level: 'Level',
    available: 'Verfügbar ab',
    immediately: 'sofort',
    location: 'Standort',
    rate: 'Stundensatz',
    perHour: 'Std.',
    summary: 'Kurzprofil',
    skills: 'Skills',
    years: 'J.',
    experience: 'Berufserfahrung',
    present: 'heute',
    education: 'Ausbildung & Zertifikate',
    languages: 'Sprachen',
    confidential: 'Vertraulich',
    native: 'Muttersprache',
    request: 'Anfrage',
    client: 'Kunde',
    proposals: 'Vorgeschlagene Profile',
    start: 'Start bis',
    date: 'Stand',
    match: 'Passung',
  },
  en: {
    profile: 'Developer profile',
    ref: 'Ref.',
    developer: 'Developer',
    level: 'Level',
    available: 'Available from',
    immediately: 'immediately',
    location: 'Location',
    rate: 'Hourly rate',
    perHour: 'h',
    summary: 'Summary',
    skills: 'Skills',
    years: 'yrs',
    experience: 'Experience',
    present: 'present',
    education: 'Education & certifications',
    languages: 'Languages',
    confidential: 'Confidential',
    native: 'native',
    request: 'Request',
    client: 'Client',
    proposals: 'Proposed profiles',
    start: 'Start by',
    date: 'Date',
    match: 'Match',
  },
} satisfies Record<Locale, Record<string, string>>;

const SENIORITY: Record<Locale, Record<Seniority, string>> = {
  de: { junior: 'Junior', mid: 'Mid-Level', senior: 'Senior', lead: 'Lead' },
  en: { junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead' },
};

const intl = (l: Locale) => (l === 'de' ? 'de-AT' : 'en-GB');
const fmtDate = (iso: string, l: Locale) =>
  new Intl.DateTimeFormat(intl(l), { dateStyle: 'medium' }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00`),
  );
const fmtMonth = (iso: string, l: Locale) =>
  new Intl.DateTimeFormat(intl(l), { month: '2-digit', year: 'numeric' }).format(
    new Date(`${iso.slice(0, 7)}-01T00:00:00`),
  );
const langName = (code: string, l: Locale) => {
  try {
    return new Intl.DisplayNames([intl(l)], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};
export const refOf = (publicRef: number) => String(publicRef).padStart(3, '0');

const CSS = `
.page{position:relative}
.break{break-before:page}
.top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${brand.primaryColor};padding-bottom:10px;margin-bottom:16px}
.brand{display:flex;gap:8px;align-items:center;font-weight:700;font-size:12pt}
.brand svg{width:22px;height:22px}
.top small{color:#5b6475;font-size:8.5pt}
h5,.facts small,.cover th{letter-spacing:0}
.id{display:flex;gap:14px;align-items:center;margin-bottom:14px}
.av.ref{font-size:11pt}
.av{width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15pt;background:${brand.primaryColor};flex:none}
h2{font-size:18pt;letter-spacing:-.02em;line-height:1.15}
.role{color:#3f4859;font-size:11pt}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:6px}
.facts div{background:#f3f6fc;border-radius:7px;padding:7px 10px}
.facts small{display:block;color:#5b6475;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em}
.facts b{font-size:10pt}
h5{font-size:8.5pt;text-transform:uppercase;letter-spacing:.08em;color:${brand.primaryDarkColor};margin:14px 0 6px;border-bottom:1px solid #e2e7f0;padding-bottom:3px;break-after:avoid}
.skills{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px}
.skills>div{display:grid;grid-template-columns:1fr 70px 34px;gap:6px;align-items:center}
.dots{display:flex;gap:3px}.dots i{width:12px;height:5px;border-radius:3px;background:#e2e7f0}.dots i.f{background:${brand.primaryColor}}
.muted{color:#5b6475}
.ex{margin-bottom:8px;break-inside:avoid}.ex p{margin-top:2px}
.cover h1{font-size:22pt;margin:40px 0 6px}
.cover table{width:100%;border-collapse:collapse;margin-top:18px}
.cover td,.cover th{text-align:left;padding:6px 4px;border-bottom:1px solid #e2e7f0;font-size:10pt}
.cover th{font-size:8pt;text-transform:uppercase;color:#5b6475;letter-spacing:.05em}
`;

const dots = (level: number) =>
  `<span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= level ? 'f' : ''}"></i>`).join('')}</span>`;

function header(L: (typeof LABELS)[Locale], ref: string) {
  return `<div class="top"><div class="brand">${brand.logoSvg}${e(brand.name)}</div><small>${L.profile} · ${L.ref} ${ref}</small></div>`;
}

/** One profile page (or several for the long variant). Only client-safe fields are used. */
export function profileSection(agg: DeveloperAggregate, opts: PdfOptions, today: string): string {
  const L = LABELS[opts.lang];
  const d = agg.dev;
  const ref = refOf(d.publicRef);
  const short = opts.variant === 'short';
  const fullName = [d.firstName, d.lastName].filter(Boolean).join(' ');
  // Anonymised: reference instead of name, no initials. Contact data is never printed.
  const name = opts.anonymized || !fullName ? `${L.developer} #${ref}` : fullName;
  const initials =
    opts.anonymized || !fullName
      ? `#${ref}`
      : fullName
          .split(/\s+/)
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
  const skills = [...agg.skills]
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .slice(0, short ? 8 : undefined);
  const exps = [...agg.experiences]
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate))
    .slice(0, short ? 2 : undefined);
  const available =
    !d.availableFrom || d.availableFrom <= today
      ? L.immediately
      : fmtDate(d.availableFrom, opts.lang);
  const summary =
    (opts.lang === 'en' ? d.summaryEn || d.summaryDe : d.summaryDe || d.summaryEn) ?? '';
  const education =
    (opts.lang === 'en' ? d.educationEn || d.educationDe : d.educationDe || d.educationEn) ?? '';
  const rate =
    opts.showRate && d.hourlyRateCents != null
      ? `${new Intl.NumberFormat(intl(opts.lang), { style: 'currency', currency: d.currency }).format(d.hourlyRateCents / 100)} / ${L.perHour}`
      : null;

  return `<section class="page">
${header(L, ref)}
<div class="id"><div class="av${initials.startsWith('#') ? ' ref' : ''}">${e(initials)}</div><div><h2>${e(name)}</h2><p class="role">${e(d.title)}</p></div></div>
<div class="facts">
  <div><small>${L.level}</small><b>${SENIORITY[opts.lang][d.seniority]}</b></div>
  <div><small>${L.available}</small><b>${e(available)}</b></div>
  <div><small>${L.location}</small><b>${e(d.location || '–')}</b></div>
  <div>${rate ? `<small>${L.rate}</small><b>${e(rate)}</b>` : '<small>&nbsp;</small><b>&nbsp;</b>'}</div>
</div>
<h5>${L.summary}</h5><p>${e(summary)}</p>
<h5>${L.skills}</h5><div class="skills">${skills
    .map(
      (s) =>
        `<div><span>${e(s.name)}</span>${dots(s.level)}<span class="muted">${s.years} ${L.years}</span></div>`,
    )
    .join('')}</div>
<h5>${L.experience}</h5>${exps
    .map((x) => {
      const desc =
        opts.lang === 'en'
          ? x.descriptionEn || x.descriptionDe
          : x.descriptionDe || x.descriptionEn;
      const period = `${fmtMonth(x.fromDate, opts.lang)} – ${x.toDate ? fmtMonth(x.toDate, opts.lang) : L.present}`;
      return `<div class="ex"><b>${e(x.role)}</b> <span class="muted">· ${e(x.company)} · ${period}</span>${!short && desc ? `<p>${e(desc)}</p>` : ''}</div>`;
    })
    .join('')}
${
  short
    ? ''
    : `<h5>${L.education}</h5>${education ? `<p>${e(education)}</p>` : ''}${
        agg.certifications.length
          ? `<p>${agg.certifications.map((c) => e([c.name, c.issuer, c.year].filter(Boolean).join(', '))).join(' · ')}</p>`
          : ''
      }`
}
<h5>${L.languages}</h5><p>${agg.languages
    .map(
      (l) => `${e(langName(l.language, opts.lang))} (${l.level === 'NATIVE' ? L.native : l.level})`,
    )
    .join(' · ')}</p>
</section>`;
}

/** Footer text on every page (CSS @page margin boxes, plain text – not HTML). */
function footer(lang: Locale, today: string) {
  const L = LABELS[lang];
  return {
    left: `${L.confidential} · ${brand.name} · ${brand.city[lang]}`,
    right: `${L.date}: ${fmtDate(today, lang)}`,
  };
}

export function renderProfileHtml(
  agg: DeveloperAggregate,
  opts: PdfOptions,
  today: string,
): string {
  const title = `${LABELS[opts.lang].profile} ${refOf(agg.dev.publicRef)}`;
  return documentShell(
    opts.lang,
    title,
    CSS,
    profileSection(agg, opts, today),
    footer(opts.lang, today),
  );
}

export interface BundleInfo {
  requestTitle: string;
  clientName: string;
  startBy: string | null;
  scores: Map<string, number>;
}

/** Cover page listing all proposed profiles, followed by one profile per developer. */
export function renderBundleHtml(
  aggs: DeveloperAggregate[],
  info: BundleInfo,
  opts: PdfOptions,
  today: string,
): string {
  const L = LABELS[opts.lang];
  const rows = aggs
    .map((a) => {
      const fullName = [a.dev.firstName, a.dev.lastName].filter(Boolean).join(' ');
      const name =
        opts.anonymized || !fullName ? `${L.developer} #${refOf(a.dev.publicRef)}` : fullName;
      const score = info.scores.get(a.dev.id);
      return `<tr><td>#${refOf(a.dev.publicRef)}</td><td>${e(name)}</td><td>${e(a.dev.title)}</td><td>${SENIORITY[opts.lang][a.dev.seniority]}</td><td>${score != null ? `${score} %` : '–'}</td></tr>`;
    })
    .join('');
  const cover = `<section class="page cover">
<div class="top"><div class="brand">${brand.logoSvg}${e(brand.name)}</div><small>${L.proposals}</small></div>
<h1>${e(info.requestTitle)}</h1>
<p class="muted">${L.client}: ${e(info.clientName)}${info.startBy ? ` · ${L.start} ${fmtDate(info.startBy, opts.lang)}` : ''}</p>
<table><thead><tr><th>${L.ref}</th><th>${L.developer}</th><th>&nbsp;</th><th>${L.level}</th><th>${L.match}</th></tr></thead><tbody>${rows}</tbody></table>
</section>`;
  const profiles = aggs
    .map((a) => `<div class="break">${profileSection(a, opts, today)}</div>`)
    .join('');
  return documentShell(
    opts.lang,
    `${L.request}: ${info.requestTitle}`,
    CSS,
    cover + profiles,
    footer(opts.lang, today),
  );
}
