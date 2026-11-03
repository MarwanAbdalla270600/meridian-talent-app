/** Fictional demo data (taken from the reference prototype). All people and companies are invented. */
import type { DeveloperStatus, LanguageLevel, Role, Seniority } from '@meridian/shared';
import { normalizeSkillName } from '@meridian/shared';
import { count, sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  certifications,
  clients,
  developerLanguages,
  developerSkills,
  developers,
  experiences,
  requestDevelopers,
  requestSkills,
  requests,
  skills,
  statusHistory,
} from './schema';

const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

interface DemoDev {
  first: string;
  last: string;
  title: string;
  sen: Seniority;
  avail: number;
  rate: number;
  status: DeveloperStatus;
  placed?: boolean;
  consent: boolean;
  sumDe: string;
  sumEn: string;
  skills: [string, number, number][];
  exp: { role: string; co: string; from: string; to: string | null; de: string; en: string }[];
  eduDe: string;
  eduEn: string;
  certs: string[];
  langs: [string, LanguageLevel][];
  note?: string;
  reviewNote?: string;
}

const DEVS: DemoDev[] = [
  {
    first: 'Karim',
    last: 'Hassan',
    title: 'Senior Fullstack Developer',
    sen: 'senior',
    avail: 0,
    rate: 4800,
    status: 'P2_FREIGEGEBEN',
    consent: true,
    sumDe:
      'Fullstack-Entwickler mit Schwerpunkt Java und Angular. Hat mehrere Kundenportale im Bankenumfeld von der Architektur bis zum Livegang begleitet und Teams von bis zu fünf Personen angeleitet.',
    sumEn:
      'Fullstack developer focused on Java and Angular. Has taken several customer portals in banking from architecture to go-live and led teams of up to five people.',
    skills: [
      ['Java', 5, 9],
      ['Spring Boot', 5, 7],
      ['Angular', 4, 6],
      ['TypeScript', 4, 6],
      ['PostgreSQL', 4, 8],
      ['AWS', 3, 4],
      ['Docker', 4, 5],
      ['CI/CD', 4, 5],
    ],
    exp: [
      {
        role: 'Senior Fullstack Developer',
        co: 'Fintech-Plattform (Demo)',
        from: '2021-03',
        to: null,
        de: 'Entwicklung eines Kundenportals mit Spring Boot und Angular, Migration auf AWS, Aufbau der CI/CD-Pipeline.',
        en: 'Built a customer portal with Spring Boot and Angular, migrated to AWS, set up the CI/CD pipeline.',
      },
      {
        role: 'Java Developer',
        co: 'Versicherungs-IT (Demo)',
        from: '2017-01',
        to: '2021-02',
        de: 'Weiterentwicklung eines Vertragssystems, Performance-Tuning von Oracle-Abfragen.',
        en: 'Extended a contract system, tuned Oracle queries.',
      },
    ],
    eduDe: 'B.Sc. Informatik',
    eduEn: 'B.Sc. Computer Science',
    certs: ['AWS Certified Developer – Associate'],
    langs: [
      ['de', 'B2'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
    note: 'Bevorzugt Projekte ab 6 Monaten.',
  },
  {
    first: 'Nour',
    last: 'Adel',
    title: 'DevOps / Cloud Engineer',
    sen: 'senior',
    avail: 21,
    rate: 5200,
    status: 'P2_FREIGEGEBEN',
    consent: true,
    sumDe:
      'Cloud- und DevOps-Engineer mit Fokus auf AWS und Kubernetes. Automatisiert Infrastruktur mit Terraform und baut zuverlässige Deployment-Pipelines.',
    sumEn:
      'Cloud and DevOps engineer focused on AWS and Kubernetes. Automates infrastructure with Terraform and builds reliable deployment pipelines.',
    skills: [
      ['AWS', 5, 7],
      ['Kubernetes', 5, 5],
      ['Terraform', 5, 5],
      ['Docker', 5, 7],
      ['GitLab CI', 4, 5],
      ['Linux', 5, 9],
      ['Python', 3, 5],
      ['Prometheus', 4, 4],
    ],
    exp: [
      {
        role: 'DevOps Engineer',
        co: 'E-Commerce-Anbieter (Demo)',
        from: '2020-05',
        to: null,
        de: 'Betrieb eines Kubernetes-Clusters, Infrastruktur komplett als Code, Kostenoptimierung in AWS.',
        en: 'Ran a Kubernetes cluster, infrastructure fully as code, AWS cost optimisation.',
      },
      {
        role: 'Systemadministrator',
        co: 'Hosting-Anbieter (Demo)',
        from: '2016-02',
        to: '2020-04',
        de: 'Linux-Server, Monitoring, Automatisierung mit Ansible.',
        en: 'Linux servers, monitoring, automation with Ansible.',
      },
    ],
    eduDe: 'B.Sc. Informatik',
    eduEn: 'B.Sc. Computer Science',
    certs: ['CKA – Certified Kubernetes Administrator', 'AWS Solutions Architect – Associate'],
    langs: [
      ['de', 'B1'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
  },
  {
    first: 'Omar',
    last: 'Samir',
    title: 'Frontend Developer',
    sen: 'mid',
    avail: 0,
    rate: 3800,
    status: 'P2_FREIGEGEBEN',
    consent: true,
    sumDe:
      'Frontend-Entwickler mit React und TypeScript. Legt Wert auf saubere Komponenten, Barrierefreiheit und automatisierte Tests.',
    sumEn:
      'Frontend developer with React and TypeScript. Cares about clean components, accessibility and automated tests.',
    skills: [
      ['React', 5, 5],
      ['TypeScript', 4, 5],
      ['Next.js', 4, 3],
      ['Vue', 3, 2],
      ['Cypress', 4, 3],
      ['HTML/CSS', 5, 6],
      ['Node.js', 3, 3],
    ],
    exp: [
      {
        role: 'Frontend Developer',
        co: 'SaaS-Start-up (Demo)',
        from: '2022-01',
        to: null,
        de: 'Aufbau eines Design-Systems und einer Dashboard-Anwendung in React.',
        en: 'Built a design system and a dashboard application in React.',
      },
    ],
    eduDe: 'B.Sc. Wirtschaftsinformatik',
    eduEn: 'B.Sc. Business Informatics',
    certs: [],
    langs: [
      ['de', 'B1'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
  },
  {
    first: 'Salma',
    last: 'Youssef',
    title: 'Backend Developer (PHP / Laravel)',
    sen: 'mid',
    avail: 14,
    rate: 4000,
    status: 'P2_FREIGEGEBEN',
    consent: true,
    sumDe:
      'Backend-Entwicklerin mit Laravel und MySQL. Erfahren mit REST-APIs, Zahlungsanbindungen und der Modernisierung älterer PHP-Anwendungen.',
    sumEn:
      'Backend developer with Laravel and MySQL. Experienced with REST APIs, payment integrations and modernising older PHP applications.',
    skills: [
      ['PHP', 5, 7],
      ['Laravel', 5, 5],
      ['MySQL', 4, 7],
      ['Vue', 3, 3],
      ['Docker', 3, 3],
      ['REST APIs', 5, 6],
      ['Ruby on Rails', 2, 1],
    ],
    exp: [
      {
        role: 'Backend Developer',
        co: 'Agentur (Demo)',
        from: '2019-04',
        to: null,
        de: 'Laravel-Anwendungen für Kunden aus Handel und Logistik, Upgrade von PHP 5 auf PHP 8.',
        en: 'Laravel applications for retail and logistics clients, upgrade from PHP 5 to PHP 8.',
      },
    ],
    eduDe: 'B.Sc. Informatik',
    eduEn: 'B.Sc. Computer Science',
    certs: ['Laravel Certified Developer'],
    langs: [
      ['de', 'B2'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
  },
  {
    first: 'Tarek',
    last: 'Mostafa',
    title: 'SAP ABAP / Fiori Developer',
    sen: 'senior',
    avail: 45,
    rate: 6200,
    status: 'P2_FREIGEGEBEN',
    placed: true,
    consent: true,
    sumDe:
      'SAP-Entwickler mit Schwerpunkt ABAP Cloud, RAP und Fiori. Begleitet S/4HANA-Migrationen und passt Custom Code an.',
    sumEn:
      'SAP developer focused on ABAP Cloud, RAP and Fiori. Supports S/4HANA migrations and adapts custom code.',
    skills: [
      ['SAP ABAP', 5, 10],
      ['RAP', 4, 3],
      ['SAP Fiori', 4, 4],
      ['CDS', 4, 4],
      ['S/4HANA', 4, 4],
      ['SAPUI5', 4, 4],
      ['SAP BTP', 3, 2],
    ],
    exp: [
      {
        role: 'Senior SAP Developer',
        co: 'Industrieunternehmen (Demo)',
        from: '2016-09',
        to: null,
        de: 'Custom-Code-Anpassung für S/4HANA, Fiori-Apps und RAP-Services.',
        en: 'Custom code adaptation for S/4HANA, Fiori apps and RAP services.',
      },
    ],
    eduDe: 'B.Sc. Wirtschaftsinformatik',
    eduEn: 'B.Sc. Business Informatics',
    certs: ['SAP Certified Development Associate – ABAP Cloud'],
    langs: [
      ['de', 'B2'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
    note: 'Aktuell im Einsatz, frei ab Jahresmitte.',
  },
  {
    first: 'Hana',
    last: 'Ibrahim',
    title: 'Data Engineer',
    sen: 'mid',
    avail: 7,
    rate: 4500,
    status: 'P1_EINGEREICHT',
    consent: true,
    sumDe:
      'Data Engineer mit Python, SQL und Kafka. Baut Datenpipelines und Auswertungen auf PostgreSQL und Cloud-Data-Warehouses.',
    sumEn:
      'Data engineer with Python, SQL and Kafka. Builds data pipelines and reporting on PostgreSQL and cloud data warehouses.',
    skills: [
      ['Python', 5, 6],
      ['SQL', 5, 7],
      ['Kafka', 4, 3],
      ['PostgreSQL', 4, 6],
      ['AWS', 3, 3],
      ['Airflow', 4, 3],
      ['Snowflake', 3, 2],
    ],
    exp: [
      {
        role: 'Data Engineer',
        co: 'Logistik-Plattform (Demo)',
        from: '2020-06',
        to: null,
        de: 'Echtzeit-Datenpipelines mit Kafka, Reporting für Disposition.',
        en: 'Real-time data pipelines with Kafka, reporting for dispatch.',
      },
    ],
    eduDe: 'M.Sc. Data Science',
    eduEn: 'M.Sc. Data Science',
    certs: [],
    langs: [
      ['de', 'A2'],
      ['en', 'C1'],
      ['ar', 'NATIVE'],
    ],
  },
  {
    first: 'Mahmoud',
    last: 'Ali',
    title: 'Python Backend Developer',
    sen: 'junior',
    avail: 10,
    rate: 3000,
    status: 'P1_IN_ERFASSUNG',
    consent: false,
    sumDe: 'Junior-Entwickler mit Python und Django.',
    sumEn: '',
    skills: [
      ['Python', 3, 2],
      ['Django', 3, 2],
    ],
    exp: [],
    eduDe: 'B.Sc. Informatik',
    eduEn: 'B.Sc. Computer Science',
    certs: [],
    langs: [
      ['en', 'B2'],
      ['ar', 'NATIVE'],
    ],
    reviewNote: 'Bitte Berufserfahrung und englisches Kurzprofil ergänzen.',
  },
];

export async function seedDemoData(db: Db, ids: Partial<Record<Role, string>>) {
  const [existing] = await db.select({ n: count() }).from(developers);
  if ((existing?.n ?? 0) > 0) return; // only on an empty database

  const catalog = await db.select().from(skills);
  const skillId = (name: string) => {
    const n = normalizeSkillName(name);
    const s = catalog.find(
      (c) => normalizeSkillName(c.name) === n || c.aliases.some((a) => normalizeSkillName(a) === n),
    );
    if (!s) throw new Error(`Demo skill missing in catalog: ${name}`);
    return s.id;
  };
  const egypt = ids.egypt_editor ?? null;
  const austria = ids.austria_reviewer ?? null;
  const devIds: string[] = [];

  await db.transaction(async (tx) => {
    for (const d of DEVS) {
      const approved = d.status === 'P2_FREIGEGEBEN';
      const [row] = await tx
        .insert(developers)
        .values({
          firstName: d.first,
          lastName: d.last,
          title: d.title,
          seniority: d.sen,
          location: 'Remote',
          availableFrom: plus(d.avail),
          hourlyRateCents: d.rate,
          status: d.status,
          isPlaced: d.placed ?? false,
          summaryDe: d.sumDe,
          summaryEn: d.sumEn || null,
          educationDe: d.eduDe,
          educationEn: d.eduEn,
          internalNote: d.note ?? null,
          reviewNote: d.reviewNote ?? null,
          consentGiven: d.consent,
          consentAt: d.consent ? plus(-30) : null,
          consentVersion: d.consent ? '2026-01' : null,
          createdBy: egypt,
          approvedBy: approved ? austria : null,
          approvedAt: approved ? new Date() : null,
        })
        .returning({ id: developers.id });
      const id = row!.id;
      devIds.push(id);
      if (d.skills.length)
        await tx.insert(developerSkills).values(
          d.skills.map(([n, level, years]) => ({
            developerId: id,
            skillId: skillId(n),
            level,
            years,
          })),
        );
      if (d.exp.length)
        await tx.insert(experiences).values(
          d.exp.map((e, i) => ({
            developerId: id,
            role: e.role,
            company: e.co,
            fromDate: `${e.from}-01`,
            toDate: e.to ? `${e.to}-01` : null,
            descriptionDe: e.de,
            descriptionEn: e.en,
            sortOrder: i,
          })),
        );
      if (d.certs.length)
        await tx.insert(certifications).values(d.certs.map((name) => ({ developerId: id, name })));
      await tx
        .insert(developerLanguages)
        .values(d.langs.map(([language, level]) => ({ developerId: id, language, level })));
      const hist: {
        from: DeveloperStatus | null;
        to: DeveloperStatus;
        actor: string | null;
        note?: string;
      }[] = [{ from: null, to: 'P1_IN_ERFASSUNG', actor: egypt }];
      if (d.status !== 'P1_IN_ERFASSUNG' || d.reviewNote)
        hist.push({ from: 'P1_IN_ERFASSUNG', to: 'P1_EINGEREICHT', actor: egypt });
      if (d.reviewNote)
        hist.push({
          from: 'P1_EINGEREICHT',
          to: 'P1_IN_ERFASSUNG',
          actor: austria,
          note: d.reviewNote,
        });
      if (approved) hist.push({ from: 'P1_EINGEREICHT', to: 'P2_FREIGEGEBEN', actor: austria });
      await tx.insert(statusHistory).values(
        hist.map((h, i) => ({
          developerId: id,
          fromStatus: h.from,
          toStatus: h.to,
          actorId: h.actor,
          note: h.note ?? null,
          createdAt: new Date(Date.now() - (hist.length - i) * 864e5),
        })),
      );
    }

    const cl = await tx
      .insert(clients)
      .values([
        {
          name: 'Alpenbank Digital (Demo)',
          contactName: 'Frau Berger',
          contactEmail: 'berger@alpenbank.example',
        },
        {
          name: 'Logistik Nord GmbH (Demo)',
          contactName: 'Herr Wagner',
          contactEmail: 'wagner@logistik-nord.example',
        },
        {
          name: 'Industrie AG (Demo)',
          contactName: 'Frau Novak',
          contactEmail: 'novak@industrie.example',
        },
      ])
      .returning({ id: clients.id });
    const reqDefs = [
      {
        c: 0,
        title: 'Fullstack Developer Kundenportal',
        sen: 'senior' as const,
        start: 30,
        status: 'proposed' as const,
        skills: [
          ['Java', 4],
          ['Spring Boot', 4],
          ['Angular', 3],
          ['AWS', 3],
        ] as const,
        assigned: [0],
      },
      {
        c: 1,
        title: 'DevOps Engineer Plattform',
        sen: 'senior' as const,
        start: 45,
        status: 'proposed' as const,
        skills: [
          ['Kubernetes', 4],
          ['Terraform', 4],
          ['AWS', 4],
          ['CI/CD', 3],
        ] as const,
        assigned: [1],
      },
      {
        c: 2,
        title: 'SAP Fiori Entwickler',
        sen: 'mid' as const,
        start: 60,
        status: 'open' as const,
        skills: [
          ['SAP Fiori', 4],
          ['SAP ABAP', 4],
          ['RAP', 3],
        ] as const,
        assigned: [],
      },
    ];
    for (const r of reqDefs) {
      const [req] = await tx
        .insert(requests)
        .values({
          clientId: cl[r.c]!.id,
          title: r.title,
          seniority: r.sen,
          startBy: plus(r.start),
          status: r.status,
          createdBy: austria,
        })
        .returning({ id: requests.id });
      await tx
        .insert(requestSkills)
        .values(
          r.skills.map(([n, minLevel]) => ({ requestId: req!.id, skillId: skillId(n), minLevel })),
        );
      if (r.assigned.length)
        await tx.insert(requestDevelopers).values(
          r.assigned.map((i) => ({
            requestId: req!.id,
            developerId: devIds[i]!,
            proposedBy: austria,
          })),
        );
    }
  });
  await db.execute(sql`select 1`);
}
