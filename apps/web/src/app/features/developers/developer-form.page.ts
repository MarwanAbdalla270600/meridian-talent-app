import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DeveloperCreateSchema,
  LANGUAGE_LEVELS,
  normalizeSkillName,
  SENIORITIES,
  type DeveloperCreateInput,
  type DeveloperDetail,
  type LanguageLevel,
  type Seniority,
  type Skill,
} from '@meridian/shared';
import { debounceTime } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { toApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { loadDraft, removeDraft, saveDraft, type Draft } from '../../shared/drafts';
import { fullName } from '../../shared/ui/badges';
import { IconComponent } from '../../shared/ui/icon.component';

const LANGUAGE_CODES = [
  'de',
  'en',
  'ar',
  'fr',
  'es',
  'it',
  'tr',
  'ru',
  'pl',
  'ro',
  'hu',
  'cs',
  'nl',
  'pt',
  'uk',
  'hr',
  'sr',
  'bs',
  'sl',
  'sk',
  'bg',
  'el',
  'zh',
  'hi',
  'ur',
  'fa',
];

type SkillForm = FormGroup<{
  name: FormControl<string>;
  level: FormControl<number>;
  years: FormControl<number>;
}>;
type ExpForm = FormGroup<{
  role: FormControl<string>;
  company: FormControl<string>;
  fromDate: FormControl<string>;
  toDate: FormControl<string>;
  current: FormControl<boolean>;
  descriptionDe: FormControl<string>;
  descriptionEn: FormControl<string>;
}>;
type CertForm = FormGroup<{
  name: FormControl<string>;
  issuer: FormControl<string>;
  year: FormControl<number | null>;
}>;
type LangForm = FormGroup<{ language: FormControl<string>; level: FormControl<LanguageLevel> }>;

@Component({
  selector: 'app-developer-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      [routerLink]="id() ? ['/developers', id()] : '/developers'"
      class="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand"
    >
      <app-icon name="back" [size]="16" />{{ 'common.back' | transloco }}
    </a>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <header class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <h1>
          {{
            id() ? ('form.titleEdit' | transloco: { name: title() }) : ('form.titleNew' | transloco)
          }}
        </h1>
        <div class="flex gap-2">
          <a [routerLink]="id() ? ['/developers', id()] : '/developers'" class="btn">{{
            'common.cancel' | transloco
          }}</a>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">
            {{ 'common.save' | transloco }}
          </button>
        </div>
      </header>

      @if (draft(); as dr) {
        <div
          class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-light px-4 py-3 text-sm"
          role="status"
        >
          <span>{{ 'form.draftFound' | transloco: { date: locale.dateTime(dr.savedAt) } }}</span>
          <button type="button" class="btn btn-sm btn-primary" (click)="restoreDraft()">
            {{ 'form.restoreDraft' | transloco }}
          </button>
          <button type="button" class="btn btn-sm" (click)="discardDraft()">
            {{ 'form.discardDraft' | transloco }}
          </button>
        </div>
      }
      @if (formErrors().length) {
        <div class="mb-4 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
          <b>{{ 'form.invalid' | transloco }}</b>
          <ul class="mt-1 list-disc pl-5">
            @for (e of formErrors(); track $index) {
              <li>{{ e }}</li>
            }
          </ul>
        </div>
      }

      <div class="grid gap-4">
        <fieldset class="card grid gap-3">
          <legend class="section-title float-left">{{ 'form.personal' | transloco }}</legend>
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label" for="firstName">{{ 'form.firstName' | transloco }}</label>
              <input id="firstName" class="input" formControlName="firstName" autocomplete="off" />
            </div>
            <div>
              <label class="label" for="lastName">{{ 'form.lastName' | transloco }}</label>
              <input id="lastName" class="input" formControlName="lastName" autocomplete="off" />
            </div>
            <div>
              <label class="label" for="title">{{ 'form.title' | transloco }}</label>
              <input id="title" class="input" formControlName="title" />
            </div>
            <div>
              <label class="label" for="seniority">{{ 'form.seniority' | transloco }}</label>
              <select id="seniority" class="input" formControlName="seniority">
                @for (s of seniorities; track s) {
                  <option [value]="s">{{ 'seniority.' + s | transloco }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label" for="email"
                >{{ 'form.email' | transloco }}
                <span class="font-normal">({{ 'common.optional' | transloco }})</span></label
              >
              <input
                id="email"
                type="email"
                class="input"
                formControlName="email"
                autocomplete="off"
                [attr.aria-invalid]="fieldInvalid('email')"
              />
            </div>
            <div>
              <label class="label" for="phone"
                >{{ 'form.phone' | transloco }}
                <span class="font-normal">({{ 'common.optional' | transloco }})</span></label
              >
              <input
                id="phone"
                type="tel"
                class="input"
                formControlName="phone"
                autocomplete="off"
              />
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label class="label" for="location">{{ 'form.location' | transloco }}</label>
              <input id="location" class="input" formControlName="location" />
            </div>
            <div>
              <label class="label" for="availableFrom">{{
                'form.availableFrom' | transloco
              }}</label>
              <input
                id="availableFrom"
                type="date"
                class="input"
                formControlName="availableFrom"
                aria-describedby="avail-hint"
              />
              <p id="avail-hint" class="mt-1 text-xs text-muted">
                {{ 'form.availableHint' | transloco }}
              </p>
            </div>
            <div>
              <label class="label" for="isPlaced">{{ 'form.placed' | transloco }}</label>
              <select id="isPlaced" class="input" formControlName="isPlaced">
                <option [ngValue]="false">{{ 'form.active' | transloco }}</option>
                <option [ngValue]="true">{{ 'form.inUse' | transloco }}</option>
              </select>
            </div>
            @if (canRate()) {
              <div>
                <label class="label" for="rate">{{ 'form.rate' | transloco }}</label>
                <input
                  id="rate"
                  type="number"
                  min="0"
                  step="0.5"
                  class="input"
                  formControlName="rateEuro"
                />
              </div>
            }
          </div>
        </fieldset>

        <fieldset class="card grid gap-3">
          <legend class="section-title float-left">{{ 'developer.summary' | transloco }}</legend>
          <div class="grid gap-3 lg:grid-cols-2">
            <div>
              <label class="label" for="summaryDe">{{ 'form.summaryDe' | transloco }}</label>
              <textarea
                id="summaryDe"
                class="input min-h-28"
                formControlName="summaryDe"
              ></textarea>
            </div>
            <div>
              <label class="label" for="summaryEn">{{ 'form.summaryEn' | transloco }}</label>
              <textarea
                id="summaryEn"
                class="input min-h-28"
                formControlName="summaryEn"
              ></textarea>
            </div>
            <div>
              <label class="label" for="educationDe">{{ 'form.educationDe' | transloco }}</label>
              <input id="educationDe" class="input" formControlName="educationDe" />
            </div>
            <div>
              <label class="label" for="educationEn">{{ 'form.educationEn' | transloco }}</label>
              <input id="educationEn" class="input" formControlName="educationEn" />
            </div>
          </div>
        </fieldset>

        <fieldset class="card">
          <legend class="section-title float-left">{{ 'form.skills' | transloco }}</legend>
          <datalist id="skill-catalog">
            @for (s of catalog(); track s.id) {
              <option [value]="s.name"></option>
            }
          </datalist>
          <div class="clear-both grid gap-2" formArrayName="skills">
            <div
              class="hidden grid-cols-[1fr_110px_90px_40px] gap-2 text-xs font-semibold text-muted sm:grid"
              aria-hidden="true"
            >
              <span>{{ 'form.skill' | transloco }}</span
              ><span>{{ 'form.skillLevel' | transloco }}</span
              ><span>{{ 'form.skillYears' | transloco }}</span>
            </div>
            @for (g of skills.controls; track g; let i = $index) {
              <div
                class="grid grid-cols-[1fr_110px_90px_40px] items-start gap-2"
                [formGroupName]="i"
              >
                <div>
                  <label class="sr-only" [for]="'sk-' + i"
                    >{{ 'form.skill' | transloco }} {{ i + 1 }}</label
                  >
                  <input
                    [id]="'sk-' + i"
                    class="input"
                    formControlName="name"
                    list="skill-catalog"
                    [placeholder]="'form.skillPlaceholder' | transloco"
                  />
                  @if (isNewSkill(g.controls.name.value)) {
                    <p class="mt-1 text-xs text-warn">{{ 'form.newSkillHint' | transloco }}</p>
                  }
                </div>
                <label class="sr-only" [for]="'skl-' + i">{{
                  'form.skillLevel' | transloco
                }}</label>
                <select [id]="'skl-' + i" class="input" formControlName="level">
                  @for (n of [1, 2, 3, 4, 5]; track n) {
                    <option [ngValue]="n">{{ n }}</option>
                  }
                </select>
                <label class="sr-only" [for]="'sky-' + i">{{
                  'form.skillYears' | transloco
                }}</label>
                <input
                  [id]="'sky-' + i"
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  class="input"
                  formControlName="years"
                />
                <button
                  type="button"
                  class="btn btn-sm btn-danger h-9"
                  (click)="skills.removeAt(i)"
                  [attr.aria-label]="('common.remove' | transloco) + ' ' + g.controls.name.value"
                >
                  ×
                </button>
              </div>
            }
          </div>
          <button type="button" class="btn btn-sm mt-3" (click)="addSkill()">
            <app-icon name="plus" [size]="14" />{{ 'form.addSkill' | transloco }}
          </button>
        </fieldset>

        <fieldset class="card">
          <legend class="section-title float-left">{{ 'form.experience' | transloco }}</legend>
          <div class="clear-both grid gap-3" formArrayName="experiences">
            @for (g of experiences.controls; track g; let i = $index) {
              <div class="grid gap-2 rounded-xl border border-line p-3" [formGroupName]="i">
                <div class="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label class="label" [for]="'ex-role-' + i">{{
                      'form.role' | transloco
                    }}</label>
                    <input [id]="'ex-role-' + i" class="input" formControlName="role" />
                  </div>
                  <div>
                    <label class="label" [for]="'ex-co-' + i">{{
                      'form.company' | transloco
                    }}</label>
                    <input [id]="'ex-co-' + i" class="input" formControlName="company" />
                  </div>
                </div>
                <div class="grid items-end gap-2 sm:grid-cols-4">
                  <div>
                    <label class="label" [for]="'ex-from-' + i">{{
                      'form.from' | transloco
                    }}</label>
                    <input
                      [id]="'ex-from-' + i"
                      type="month"
                      class="input"
                      formControlName="fromDate"
                    />
                  </div>
                  <div>
                    <label class="label" [for]="'ex-to-' + i">{{ 'form.to' | transloco }}</label>
                    @if (g.controls.current.value) {
                      <p [id]="'ex-to-' + i" class="input bg-slate-50 text-muted">
                        {{ 'developer.present' | transloco }}
                      </p>
                    } @else {
                      <input
                        [id]="'ex-to-' + i"
                        type="month"
                        class="input"
                        formControlName="toDate"
                      />
                    }
                  </div>
                  <label class="flex items-center gap-2 pb-2 text-sm"
                    ><input type="checkbox" formControlName="current" />
                    {{ 'form.current' | transloco }}</label
                  >
                  <div class="flex justify-end gap-1 pb-1">
                    <button
                      type="button"
                      class="btn btn-sm"
                      (click)="move(i, -1)"
                      [disabled]="i === 0"
                      [attr.aria-label]="'form.moveUp' | transloco"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      (click)="move(i, 1)"
                      [disabled]="i === experiences.length - 1"
                      [attr.aria-label]="'form.moveDown' | transloco"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-danger"
                      (click)="experiences.removeAt(i)"
                    >
                      {{ 'common.remove' | transloco }}
                    </button>
                  </div>
                </div>
                <div class="grid gap-2 lg:grid-cols-2">
                  <div>
                    <label class="label" [for]="'ex-de-' + i">{{
                      'form.descriptionDe' | transloco
                    }}</label>
                    <textarea
                      [id]="'ex-de-' + i"
                      class="input min-h-20"
                      formControlName="descriptionDe"
                    ></textarea>
                  </div>
                  <div>
                    <label class="label" [for]="'ex-en-' + i">{{
                      'form.descriptionEn' | transloco
                    }}</label>
                    <textarea
                      [id]="'ex-en-' + i"
                      class="input min-h-20"
                      formControlName="descriptionEn"
                    ></textarea>
                  </div>
                </div>
              </div>
            }
          </div>
          <button type="button" class="btn btn-sm mt-3" (click)="addExperience()">
            <app-icon name="plus" [size]="14" />{{ 'form.addExperience' | transloco }}
          </button>
        </fieldset>

        <div class="grid gap-4 lg:grid-cols-2">
          <fieldset class="card">
            <legend class="section-title float-left">{{ 'form.languages' | transloco }}</legend>
            <div class="clear-both grid gap-2" formArrayName="languages">
              @for (g of languages.controls; track g; let i = $index) {
                <div class="grid grid-cols-[1fr_130px_40px] gap-2" [formGroupName]="i">
                  <label class="sr-only" [for]="'lg-' + i">{{ 'form.language' | transloco }}</label>
                  <select [id]="'lg-' + i" class="input" formControlName="language">
                    @for (c of languageCodes; track c) {
                      <option [value]="c">{{ locale.languageName(c) }}</option>
                    }
                  </select>
                  <label class="sr-only" [for]="'lgl-' + i">{{ 'form.level' | transloco }}</label>
                  <select [id]="'lgl-' + i" class="input" formControlName="level">
                    @for (l of levels; track l) {
                      <option [value]="l">{{ 'languageLevel.' + l | transloco }}</option>
                    }
                  </select>
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    (click)="languages.removeAt(i)"
                    [attr.aria-label]="'common.remove' | transloco"
                  >
                    ×
                  </button>
                </div>
              }
            </div>
            <button type="button" class="btn btn-sm mt-3" (click)="addLanguage()">
              <app-icon name="plus" [size]="14" />{{ 'form.addLanguage' | transloco }}
            </button>
          </fieldset>

          <fieldset class="card">
            <legend class="section-title float-left">
              {{ 'form.certifications' | transloco }}
            </legend>
            <div class="clear-both grid gap-2" formArrayName="certifications">
              @for (g of certifications.controls; track g; let i = $index) {
                <div class="grid grid-cols-[1fr_1fr_80px_40px] gap-2" [formGroupName]="i">
                  <label class="sr-only" [for]="'ce-' + i">{{ 'form.certName' | transloco }}</label>
                  <input
                    [id]="'ce-' + i"
                    class="input"
                    formControlName="name"
                    [placeholder]="'form.certName' | transloco"
                  />
                  <label class="sr-only" [for]="'ci-' + i">{{ 'form.issuer' | transloco }}</label>
                  <input
                    [id]="'ci-' + i"
                    class="input"
                    formControlName="issuer"
                    [placeholder]="'form.issuer' | transloco"
                  />
                  <label class="sr-only" [for]="'cy-' + i">{{ 'form.year' | transloco }}</label>
                  <input
                    [id]="'cy-' + i"
                    type="number"
                    class="input"
                    formControlName="year"
                    [placeholder]="'form.year' | transloco"
                  />
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    (click)="certifications.removeAt(i)"
                    [attr.aria-label]="'common.remove' | transloco"
                  >
                    ×
                  </button>
                </div>
              }
            </div>
            <button type="button" class="btn btn-sm mt-3" (click)="addCertification()">
              <app-icon name="plus" [size]="14" />{{ 'form.addCertification' | transloco }}
            </button>
          </fieldset>
        </div>

        <fieldset class="card grid gap-3">
          <legend class="section-title float-left">{{ 'form.consentSection' | transloco }}</legend>
          <label class="clear-both flex items-center gap-2 text-sm font-medium"
            ><input type="checkbox" formControlName="consentGiven" />
            {{ 'form.consentGiven' | transloco }}</label
          >
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label" for="consentAt">{{ 'developer.consentAt' | transloco }}</label>
              <input id="consentAt" type="date" class="input" formControlName="consentAt" />
            </div>
            <div>
              <label class="label" for="consentVersion">{{
                'developer.consentVersion' | transloco
              }}</label>
              <input
                id="consentVersion"
                class="input"
                formControlName="consentVersion"
                placeholder="2026-01"
              />
            </div>
          </div>
          <div>
            <label class="label" for="internalNote">{{ 'form.internalNote' | transloco }}</label>
            <textarea
              id="internalNote"
              class="input"
              formControlName="internalNote"
              aria-describedby="int-hint"
            ></textarea>
            <p id="int-hint" class="mt-1 text-xs text-muted">
              {{ 'developer.internalHint' | transloco }}
            </p>
          </div>
        </fieldset>
      </div>
    </form>
  `,
})
export class DeveloperFormPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);

  readonly id = input<string>();
  /** Pre-filled values (CV import). */
  readonly prefill = input<DeveloperCreateInput>();

  protected readonly seniorities = SENIORITIES;
  protected readonly levels = LANGUAGE_LEVELS;
  protected readonly languageCodes = LANGUAGE_CODES;
  protected readonly catalog = signal<Skill[]>([]);
  protected readonly busy = signal(false);
  protected readonly formErrors = signal<string[]>([]);
  protected readonly draft = signal<Draft<unknown> | null>(null);
  protected readonly canRate = computed(() => this.auth.can('developer:editRate'));
  private version: number | null = null;
  private loaded: DeveloperDetail | null = null;

  protected readonly form = this.fb.group({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    seniority: this.fb.control<Seniority>('mid'),
    location: 'Remote',
    availableFrom: '',
    rateEuro: this.fb.control<number | null>(null),
    isPlaced: false,
    summaryDe: '',
    summaryEn: '',
    educationDe: '',
    educationEn: '',
    internalNote: '',
    consentGiven: false,
    consentAt: '',
    consentVersion: '',
    skills: this.fb.array<SkillForm>([]),
    experiences: this.fb.array<ExpForm>([]),
    certifications: this.fb.array<CertForm>([]),
    languages: this.fb.array<LangForm>([]),
  });

  protected get skills() {
    return this.form.controls.skills;
  }
  protected get experiences() {
    return this.form.controls.experiences;
  }
  protected get certifications() {
    return this.form.controls.certifications;
  }
  protected get languages() {
    return this.form.controls.languages;
  }
  protected readonly title = signal('');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.init(id));
    });
    this.form.valueChanges
      .pipe(debounceTime(1000), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.form.dirty) saveDraft(this.draftKey(), this.form.getRawValue(), this.version);
      });
  }

  private draftKey() {
    return this.id() ?? 'new';
  }

  private async init(id: string | undefined) {
    try {
      this.catalog.set(await this.api.listSkills());
      if (id) {
        const d = await this.api.getDeveloper(id);
        if (!d.canEdit) {
          await this.router.navigate(['/developers', id]);
          return;
        }
        this.loaded = d;
        this.version = d.version;
        this.title.set(fullName(d));
        this.patch(this.fromDetail(d));
      } else if (this.prefill()) {
        this.patch(this.prefill()!);
      } else {
        this.addSkill();
        this.addLanguage();
      }
      const draft = loadDraft(this.draftKey());
      if (draft && (draft.baseVersion === this.version || !id)) this.draft.set(draft);
    } catch (err) {
      this.errors.show(err);
    }
  }

  private fromDetail(d: DeveloperDetail): DeveloperCreateInput {
    return {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
      phone: d.phone,
      title: d.title,
      seniority: d.seniority,
      location: d.location,
      availableFrom: d.availableFrom,
      hourlyRateCents: d.hourlyRateCents ?? null,
      currency: d.currency,
      isPlaced: d.isPlaced,
      summaryDe: d.summaryDe,
      summaryEn: d.summaryEn,
      educationDe: d.educationDe,
      educationEn: d.educationEn,
      internalNote: d.internalNote,
      consentGiven: d.consentGiven,
      consentAt: d.consentAt,
      consentVersion: d.consentVersion,
      skills: d.skills.map((s) => ({ skillName: s.name, level: s.level, years: s.years })),
      experiences: d.experiences.map((e) => ({ ...e })),
      certifications: d.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        year: c.year,
      })),
      languages: d.languages,
    };
  }

  private patch(v: DeveloperCreateInput) {
    this.skills.clear();
    this.experiences.clear();
    this.certifications.clear();
    this.languages.clear();
    for (const s of v.skills) this.addSkill(s.skillName ?? '', s.level, s.years);
    for (const e of v.experiences) this.addExperience(e);
    for (const c of v.certifications) this.addCertification(c);
    for (const l of v.languages) this.addLanguage(l.language, l.level);
    this.form.patchValue({
      firstName: v.firstName ?? '',
      lastName: v.lastName ?? '',
      email: v.email ?? '',
      phone: v.phone ?? '',
      title: v.title ?? '',
      seniority: v.seniority,
      location: v.location ?? '',
      availableFrom: v.availableFrom ?? '',
      rateEuro: v.hourlyRateCents != null ? v.hourlyRateCents / 100 : null,
      isPlaced: v.isPlaced,
      summaryDe: v.summaryDe ?? '',
      summaryEn: v.summaryEn ?? '',
      educationDe: v.educationDe ?? '',
      educationEn: v.educationEn ?? '',
      internalNote: v.internalNote ?? '',
      consentGiven: v.consentGiven,
      consentAt: v.consentAt ?? '',
      consentVersion: v.consentVersion ?? '',
    });
    this.form.markAsPristine();
  }

  protected addSkill(name = '', level = 3, years = 1) {
    this.skills.push(this.fb.group({ name, level, years }));
  }
  protected addExperience(e?: DeveloperCreateInput['experiences'][number]) {
    this.experiences.push(
      this.fb.group({
        role: e?.role ?? '',
        company: e?.company ?? '',
        fromDate: e?.fromDate ?? '',
        toDate: e?.toDate ?? '',
        current: e ? e.toDate === null : true,
        descriptionDe: e?.descriptionDe ?? '',
        descriptionEn: e?.descriptionEn ?? '',
      }),
    );
  }
  protected addCertification(c?: DeveloperCreateInput['certifications'][number]) {
    this.certifications.push(
      this.fb.group({
        name: c?.name ?? '',
        issuer: c?.issuer ?? '',
        year: this.fb.control<number | null>(c?.year ?? null),
      }),
    );
  }
  protected addLanguage(language = 'de', level: LanguageLevel = 'B2') {
    this.languages.push(this.fb.group({ language, level: this.fb.control<LanguageLevel>(level) }));
  }
  protected move(i: number, dir: -1 | 1) {
    const ctrl = this.experiences.at(i);
    this.experiences.removeAt(i);
    this.experiences.insert(i + dir, ctrl);
  }

  protected isNewSkill(name: string) {
    const n = name.trim();
    if (!n) return false;
    const key = normalizeSkillName(n);
    return !this.catalog().some(
      (s) =>
        normalizeSkillName(s.name) === key || s.aliases.some((a) => normalizeSkillName(a) === key),
    );
  }

  protected fieldInvalid(path: string) {
    return this.formErrors().length > 0 && this.invalidPaths.has(path) ? true : null;
  }
  private invalidPaths = new Set<string>();

  protected restoreDraft() {
    const d = this.draft();
    if (!d) return;
    const v = d.value as ReturnType<typeof this.form.getRawValue>;
    this.skills.clear();
    this.experiences.clear();
    this.certifications.clear();
    this.languages.clear();
    v.skills.forEach(() => this.addSkill());
    v.experiences.forEach(() => this.addExperience());
    v.certifications.forEach(() => this.addCertification());
    v.languages.forEach(() => this.addLanguage());
    this.form.setValue(v);
    this.form.markAsDirty();
    this.draft.set(null);
  }

  protected discardDraft() {
    removeDraft(this.draftKey());
    this.draft.set(null);
  }

  /** Converts the form into the API payload (catalog names → ids where known). */
  private payload(): DeveloperCreateInput {
    const v = this.form.getRawValue();
    const byName = new Map<string, string>();
    for (const s of this.catalog()) {
      byName.set(normalizeSkillName(s.name), s.id);
      for (const a of s.aliases) byName.set(normalizeSkillName(a), s.id);
    }
    return {
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: v.phone,
      title: v.title,
      seniority: v.seniority,
      location: v.location,
      availableFrom: v.availableFrom || null,
      ...(this.canRate()
        ? {
            hourlyRateCents:
              v.rateEuro != null && `${v.rateEuro}` !== ''
                ? Math.round(Number(v.rateEuro) * 100)
                : null,
          }
        : {}),
      currency: this.loaded?.currency ?? 'EUR',
      isPlaced: v.isPlaced,
      summaryDe: v.summaryDe,
      summaryEn: v.summaryEn,
      educationDe: v.educationDe,
      educationEn: v.educationEn,
      internalNote: v.internalNote,
      consentGiven: v.consentGiven,
      consentAt: v.consentAt || null,
      consentVersion: v.consentVersion,
      skills: v.skills
        .filter((s) => s.name.trim())
        .map((s) => {
          const skillId = byName.get(normalizeSkillName(s.name));
          return {
            ...(skillId ? { skillId } : { skillName: s.name.trim() }),
            level: Number(s.level),
            years: Number(s.years) || 0,
          };
        }),
      experiences: v.experiences.map((e) => ({
        role: e.role,
        company: e.company,
        fromDate: e.fromDate,
        toDate: e.current ? null : e.toDate || null,
        descriptionDe: e.descriptionDe,
        descriptionEn: e.descriptionEn,
      })),
      certifications: v.certifications
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name, issuer: c.issuer, year: c.year ? Number(c.year) : null })),
      languages: v.languages,
    } as DeveloperCreateInput;
  }

  protected async save() {
    const body = this.payload();
    const parsed = DeveloperCreateSchema.safeParse(body);
    if (!parsed.success) {
      this.invalidPaths = new Set(parsed.error.issues.map((i) => i.path.join('.')));
      this.formErrors.set(parsed.error.issues.map((i) => `${i.path.join(' › ')}: ${i.message}`));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    this.formErrors.set([]);
    this.busy.set(true);
    try {
      const id = this.id();
      const saved = id
        ? await this.api.updateDeveloper(id, { ...parsed.data, version: this.version! })
        : await this.api.createDeveloper(parsed.data);
      removeDraft(this.draftKey());
      this.form.markAsPristine();
      this.toast.success('common.saved');
      await this.router.navigate(['/developers', saved.id]);
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'VALIDATION_FAILED' && Array.isArray(e.details)) {
        this.formErrors.set(
          (e.details as { path: (string | number)[]; message: string }[]).map(
            (d) => `${d.path.join(' › ')}: ${d.message}`,
          ),
        );
      }
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }
}
