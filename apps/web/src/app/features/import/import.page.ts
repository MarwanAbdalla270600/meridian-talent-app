import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DeveloperCreateSchema,
  IMPORT_REVIEW_SECTIONS,
  LANGUAGE_LEVELS,
  SENIORITIES,
  type CvExtraction,
  type DeveloperCreateInput,
  type ImportDto,
  type ImportReviewSection,
} from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { IconComponent } from '../../shared/ui/icon.component';

const LOW = 0.6;
type Field = { value: string; confidence: number; source: string | null };

interface ReviewModel {
  personal: Record<'firstName' | 'lastName' | 'email' | 'phone' | 'title' | 'location', Field> & {
    seniority: Field;
  };
  summary: { summaryDe: Field; summaryEn: Field };
  education: { educationDe: Field; educationEn: Field };
  skills: { name: string; level: number; years: number; confidence: number }[];
  experiences: {
    role: string;
    company: string;
    fromDate: string;
    toDate: string;
    descriptionDe: string;
    descriptionEn: string;
    confidence: number;
  }[];
  certifications: { name: string; issuer: string; year: number | null }[];
  languages: { language: string; level: (typeof LANGUAGE_LEVELS)[number] }[];
}

const f = (x: { value: unknown; confidence: number; source: string | null }): Field => ({
  value: x.value == null ? '' : String(x.value),
  confidence: x.confidence,
  source: x.source,
});

function toModel(e: CvExtraction): ReviewModel {
  return {
    personal: {
      firstName: f(e.firstName),
      lastName: f(e.lastName),
      email: f(e.email),
      phone: f(e.phone),
      title: f(e.title),
      location: f(e.location),
      seniority: f(e.seniority.value ? e.seniority : { ...e.seniority, value: 'mid' }),
    },
    summary: { summaryDe: f(e.summaryDe), summaryEn: f(e.summaryEn) },
    education: { educationDe: f(e.educationDe), educationEn: f(e.educationEn) },
    skills: e.skills.map((s) => ({ ...s })),
    experiences: e.experiences.map((x) => ({
      role: x.role,
      company: x.company,
      fromDate: /^\d{4}-\d{2}$/.test(x.fromDate) ? x.fromDate : '',
      toDate: x.toDate && /^\d{4}-\d{2}$/.test(x.toDate) ? x.toDate : '',
      descriptionDe: x.descriptionDe ?? '',
      descriptionEn: x.descriptionEn ?? '',
      confidence: x.confidence,
    })),
    certifications: e.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer ?? '',
      year: c.year,
    })),
    languages: e.languages
      .filter((l) => /^[a-z]{2,3}$/.test(l.language))
      .map((l) => ({ language: l.language, level: l.level })),
  };
}

@Component({
  selector: 'app-import-page',
  imports: [FormsModule, NgTemplateOutlet, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1>{{ 'import.title' | transloco }}</h1>
      <p class="max-w-3xl text-muted">{{ 'import.subtitle' | transloco }}</p>
    </header>

    @if (!imp()) {
      <div class="grid max-w-3xl gap-4">
        @if (busy()) {
          <div class="card py-12 text-center" role="status">
            <p class="font-semibold">{{ 'import.analyzing' | transloco }}</p>
            <div class="mx-auto mt-4 h-2 max-w-xs overflow-hidden rounded-full bg-slate-200">
              <div class="h-full w-1/2 animate-pulse rounded-full bg-brand"></div>
            </div>
          </div>
        } @else {
          <label
            class="card block cursor-pointer border-2 border-dashed border-line2 py-12 text-center hover:border-brand hover:bg-brand-light"
            [class.!border-brand]="dragOver()"
            (dragover)="$event.preventDefault(); dragOver.set(true)"
            (dragleave)="dragOver.set(false)"
            (drop)="onDrop($event)"
          >
            <app-icon name="upload" [size]="36" class="text-brand" />
            <span class="mt-2 block font-semibold">{{ 'import.drop' | transloco }}</span>
            <span class="block text-sm text-muted">{{
              'import.dropHint' | transloco: { mb: 10 }
            }}</span>
            <input
              type="file"
              class="sr-only"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              (change)="onFile($event)"
            />
          </label>
        }
        <p class="rounded-xl bg-warn-light px-4 py-3 text-sm text-warn">
          {{ (aiEnabled() ? 'import.privacy' : 'import.aiOff') | transloco }}
        </p>
      </div>
    } @else if (imp()!.status !== 'extracted' || !model()) {
      <div class="card max-w-3xl">
        @if (imp()!.status === 'failed') {
          <p class="font-semibold text-danger" role="alert">
            {{ 'import.failed' | transloco }} {{ 'errors.' + imp()!.errorCode | transloco }}
          </p>
        } @else {
          <p class="font-semibold">{{ 'import.aiOff' | transloco }}</p>
        }
        <p class="mt-2 text-sm text-muted">{{ 'import.manualHint' | transloco }}</p>
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn btn-primary" (click)="manual()" [disabled]="busy()">
            {{ 'import.manualFallback' | transloco }}
          </button>
          <button type="button" class="btn" (click)="reset()">
            {{ 'import.another' | transloco }}
          </button>
        </div>
      </div>
    } @else {
      @let m = model()!;
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold">
            {{ 'import.reviewTitle' | transloco }} · {{ imp()!.filename }}
          </h2>
          <p class="text-sm text-muted">{{ 'import.reviewHint' | transloco }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn" (click)="reset()">
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            (click)="create()"
            [disabled]="!allConfirmed() || busy()"
          >
            {{ 'import.createDraft' | transloco }}
          </button>
        </div>
      </div>
      @if (!allConfirmed()) {
        <p class="mb-4 text-sm text-warn" role="status">{{ 'import.allSections' | transloco }}</p>
      }
      @if (formError()) {
        <p class="mb-4 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger" role="alert">
          {{ formError() }}
        </p>
      }

      <div class="grid gap-4">
        <!-- personal -->
        <fieldset class="card" [class.!border-ok]="confirmed().has('personal')">
          <legend class="section-title float-left">
            {{ 'import.sections.personal' | transloco }}
          </legend>
          <div class="clear-both grid gap-3 sm:grid-cols-2">
            @for (k of personalKeys; track k) {
              <div>
                <label class="label" [for]="'p-' + k">{{ 'form.' + k | transloco }}</label>
                <input
                  [id]="'p-' + k"
                  class="input"
                  [name]="k"
                  [(ngModel)]="m.personal[k].value"
                  [class.!border-warn]="m.personal[k].confidence < low"
                />
                <ng-container *ngTemplateOutlet="meta; context: { $implicit: m.personal[k] }" />
              </div>
            }
            <div>
              <label class="label" for="p-sen">{{ 'form.seniority' | transloco }}</label>
              <select id="p-sen" class="input" name="sen" [(ngModel)]="m.personal.seniority.value">
                @for (s of seniorities; track s) {
                  <option [value]="s">{{ 'seniority.' + s | transloco }}</option>
                }
              </select>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="confirm; context: { $implicit: 'personal' }" />
        </fieldset>

        <!-- summary + education -->
        @for (sec of textSections; track sec.key) {
          <fieldset class="card" [class.!border-ok]="confirmed().has(sec.key)">
            <legend class="section-title float-left">
              {{ 'import.sections.' + sec.key | transloco }}
            </legend>
            <div class="clear-both grid gap-3 lg:grid-cols-2">
              @for (fk of sec.fields; track fk) {
                <div>
                  <label class="label" [for]="'t-' + fk">{{ 'form.' + fk | transloco }}</label>
                  <textarea
                    [id]="'t-' + fk"
                    class="input min-h-24"
                    [name]="fk"
                    [(ngModel)]="$any(m)[sec.key][fk].value"
                    [class.!border-warn]="$any(m)[sec.key][fk].confidence < low"
                  ></textarea>
                  <ng-container
                    *ngTemplateOutlet="meta; context: { $implicit: $any(m)[sec.key][fk] }"
                  />
                </div>
              }
            </div>
            <ng-container *ngTemplateOutlet="confirm; context: { $implicit: sec.key }" />
          </fieldset>
        }

        <!-- skills -->
        <fieldset class="card" [class.!border-ok]="confirmed().has('skills')">
          <legend class="section-title float-left">
            {{ 'import.sections.skills' | transloco }}
          </legend>
          <div class="clear-both grid gap-2">
            @for (s of m.skills; track $index; let i = $index) {
              <div class="grid grid-cols-[1fr_90px_90px_auto_40px] items-center gap-2">
                <label class="sr-only" [for]="'s-' + i">{{ 'form.skill' | transloco }}</label>
                <input [id]="'s-' + i" class="input" [name]="'sn' + i" [(ngModel)]="s.name" />
                <label class="sr-only" [for]="'sl-' + i">{{ 'form.skillLevel' | transloco }}</label>
                <select [id]="'sl-' + i" class="input" [name]="'sl' + i" [(ngModel)]="s.level">
                  @for (n of [1, 2, 3, 4, 5]; track n) {
                    <option [ngValue]="n">{{ n }}</option>
                  }
                </select>
                <label class="sr-only" [for]="'sy-' + i">{{ 'form.skillYears' | transloco }}</label>
                <input
                  [id]="'sy-' + i"
                  type="number"
                  class="input"
                  [name]="'sy' + i"
                  [(ngModel)]="s.years"
                />
                <span
                  class="tag"
                  [class.tag-warn]="s.confidence < low"
                  [title]="'import.confidence' | transloco"
                  >{{ pct(s.confidence) }}</span
                >
                <button
                  type="button"
                  class="btn btn-sm btn-danger"
                  (click)="m.skills.splice(i, 1)"
                  [attr.aria-label]="'common.remove' | transloco"
                >
                  ×
                </button>
              </div>
            }
          </div>
          <ng-container *ngTemplateOutlet="confirm; context: { $implicit: 'skills' }" />
        </fieldset>

        <!-- experiences -->
        <fieldset class="card" [class.!border-ok]="confirmed().has('experiences')">
          <legend class="section-title float-left">
            {{ 'import.sections.experiences' | transloco }}
          </legend>
          <div class="clear-both grid gap-3">
            @for (x of m.experiences; track $index; let i = $index) {
              <div
                class="grid gap-2 rounded-xl border border-line p-3"
                [class.!border-warn]="x.confidence < low"
              >
                <div class="grid gap-2 sm:grid-cols-[1fr_1fr_130px_130px_auto]">
                  <input
                    class="input"
                    [name]="'xr' + i"
                    [(ngModel)]="x.role"
                    [attr.aria-label]="'form.role' | transloco"
                  />
                  <input
                    class="input"
                    [name]="'xc' + i"
                    [(ngModel)]="x.company"
                    [attr.aria-label]="'form.company' | transloco"
                  />
                  <input
                    type="month"
                    class="input"
                    [name]="'xf' + i"
                    [(ngModel)]="x.fromDate"
                    [attr.aria-label]="'form.from' | transloco"
                  />
                  <input
                    type="month"
                    class="input"
                    [name]="'xt' + i"
                    [(ngModel)]="x.toDate"
                    [attr.aria-label]="'form.to' | transloco"
                  />
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    (click)="m.experiences.splice(i, 1)"
                  >
                    {{ 'common.remove' | transloco }}
                  </button>
                </div>
                <div class="grid gap-2 lg:grid-cols-2">
                  <textarea
                    class="input"
                    [name]="'xd' + i"
                    [(ngModel)]="x.descriptionDe"
                    [attr.aria-label]="'form.descriptionDe' | transloco"
                  ></textarea>
                  <textarea
                    class="input"
                    [name]="'xe' + i"
                    [(ngModel)]="x.descriptionEn"
                    [attr.aria-label]="'form.descriptionEn' | transloco"
                  ></textarea>
                </div>
                <span class="text-xs text-muted"
                  >{{ 'import.confidence' | transloco }}: {{ pct(x.confidence) }}</span
                >
              </div>
            }
          </div>
          <ng-container *ngTemplateOutlet="confirm; context: { $implicit: 'experiences' }" />
        </fieldset>

        <div class="grid gap-4 lg:grid-cols-2">
          <fieldset class="card" [class.!border-ok]="confirmed().has('certifications')">
            <legend class="section-title float-left">
              {{ 'import.sections.certifications' | transloco }}
            </legend>
            <div class="clear-both grid gap-2">
              @for (c of m.certifications; track $index; let i = $index) {
                <div class="grid grid-cols-[1fr_1fr_80px_40px] gap-2">
                  <input
                    class="input"
                    [name]="'cn' + i"
                    [(ngModel)]="c.name"
                    [attr.aria-label]="'form.certName' | transloco"
                  />
                  <input
                    class="input"
                    [name]="'ci' + i"
                    [(ngModel)]="c.issuer"
                    [attr.aria-label]="'form.issuer' | transloco"
                  />
                  <input
                    type="number"
                    class="input"
                    [name]="'cy' + i"
                    [(ngModel)]="c.year"
                    [attr.aria-label]="'form.year' | transloco"
                  />
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    (click)="m.certifications.splice(i, 1)"
                    [attr.aria-label]="'common.remove' | transloco"
                  >
                    ×
                  </button>
                </div>
              } @empty {
                <p class="text-sm text-muted">–</p>
              }
            </div>
            <ng-container *ngTemplateOutlet="confirm; context: { $implicit: 'certifications' }" />
          </fieldset>
          <fieldset class="card" [class.!border-ok]="confirmed().has('languages')">
            <legend class="section-title float-left">
              {{ 'import.sections.languages' | transloco }}
            </legend>
            <div class="clear-both grid gap-2">
              @for (l of m.languages; track $index; let i = $index) {
                <div class="grid grid-cols-[1fr_130px_40px] items-center gap-2">
                  <span class="text-sm">{{ locale.languageName(l.language) }}</span>
                  <select
                    class="input"
                    [name]="'ll' + i"
                    [(ngModel)]="l.level"
                    [attr.aria-label]="'form.level' | transloco"
                  >
                    @for (lv of levels; track lv) {
                      <option [value]="lv">{{ 'languageLevel.' + lv | transloco }}</option>
                    }
                  </select>
                  <button
                    type="button"
                    class="btn btn-sm btn-danger"
                    (click)="m.languages.splice(i, 1)"
                    [attr.aria-label]="'common.remove' | transloco"
                  >
                    ×
                  </button>
                </div>
              } @empty {
                <p class="text-sm text-muted">–</p>
              }
            </div>
            <ng-container *ngTemplateOutlet="confirm; context: { $implicit: 'languages' }" />
          </fieldset>
        </div>
      </div>
    }

    <ng-template #meta let-field>
      <p
        class="mt-1 text-xs"
        [class.text-warn]="field.confidence < low"
        [class.text-muted]="field.confidence >= low"
      >
        {{ 'import.confidence' | transloco }}: {{ pct(field.confidence) }}
        @if (field.confidence < low) {
          · {{ 'import.lowConfidence' | transloco }}
        }
        @if (field.source) {
          <span class="block italic">{{ 'import.source' | transloco }}: „{{ field.source }}“</span>
        }
      </p>
    </ng-template>
    <ng-template #confirm let-key>
      <label class="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold">
        <input
          type="checkbox"
          [checked]="confirmed().has(key)"
          (change)="toggle(key, $any($event.target).checked)"
        />
        {{ 'import.confirmSection' | transloco }}
      </label>
    </ng-template>
  `,
})
export class ImportPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);

  protected readonly low = LOW;
  protected readonly seniorities = SENIORITIES;
  protected readonly levels = LANGUAGE_LEVELS;
  protected readonly personalKeys = [
    'firstName',
    'lastName',
    'title',
    'location',
    'email',
    'phone',
  ] as const;
  protected readonly textSections = [
    { key: 'summary' as const, fields: ['summaryDe', 'summaryEn'] },
    { key: 'education' as const, fields: ['educationDe', 'educationEn'] },
  ];
  protected readonly aiEnabled = computed(() => !!this.auth.me()?.features.cvAiImport);
  protected readonly busy = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly imp = signal<ImportDto | null>(null);
  protected readonly model = signal<ReviewModel | null>(null);
  protected readonly confirmed = signal(new Set<ImportReviewSection>());
  protected readonly formError = signal('');
  protected readonly allConfirmed = computed(() =>
    IMPORT_REVIEW_SECTIONS.every((s) => this.confirmed().has(s)),
  );

  protected pct = (c: number) => `${Math.round(c * 100)} %`;

  protected onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dragOver.set(false);
    const file = ev.dataTransfer?.files[0];
    if (file) void this.upload(file);
  }

  protected onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) void this.upload(file);
  }

  private async upload(file: File) {
    this.busy.set(true);
    try {
      const r = await this.api.uploadCv(file);
      this.imp.set(r);
      this.model.set(r.extraction ? toModel(r.extraction) : null);
      this.confirmed.set(new Set());
    } catch (err) {
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected toggle(key: ImportReviewSection, on: boolean) {
    const next = new Set(this.confirmed());
    if (on) next.add(key);
    else next.delete(key);
    this.confirmed.set(next);
  }

  protected reset() {
    this.imp.set(null);
    this.model.set(null);
    this.confirmed.set(new Set());
    this.formError.set('');
  }

  protected async manual() {
    this.busy.set(true);
    try {
      const d = await this.api.manualImport(this.imp()!.id);
      this.toast.success('import.created');
      await this.router.navigate(['/developers', d.id, 'edit']);
    } catch (err) {
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected async create() {
    const m = this.model()!;
    const p = m.personal;
    const draft = {
      firstName: p.firstName.value,
      lastName: p.lastName.value,
      email: p.email.value,
      phone: p.phone.value,
      title: p.title.value,
      seniority: p.seniority.value,
      location: p.location.value,
      availableFrom: null,
      isPlaced: false,
      currency: 'EUR',
      summaryDe: m.summary.summaryDe.value,
      summaryEn: m.summary.summaryEn.value,
      educationDe: m.education.educationDe.value,
      educationEn: m.education.educationEn.value,
      internalNote: null,
      consentGiven: false,
      consentAt: null,
      consentVersion: null,
      skills: m.skills
        .filter((s) => s.name.trim())
        .map((s) => ({
          skillName: s.name.trim(),
          level: Number(s.level),
          years: Number(s.years) || 0,
        })),
      experiences: m.experiences
        .filter((x) => x.role && x.company && x.fromDate)
        .map((x) => ({
          role: x.role,
          company: x.company,
          fromDate: x.fromDate,
          toDate: x.toDate || null,
          descriptionDe: x.descriptionDe,
          descriptionEn: x.descriptionEn,
        })),
      certifications: m.certifications
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name, issuer: c.issuer, year: c.year ? Number(c.year) : null })),
      languages: m.languages,
    };
    const parsed = DeveloperCreateSchema.safeParse(draft);
    if (!parsed.success) {
      this.formError.set(
        parsed.error.issues.map((i) => `${i.path.join(' › ')}: ${i.message}`).join(' · '),
      );
      return;
    }
    this.busy.set(true);
    try {
      const d = await this.api.confirmImport(this.imp()!.id, parsed.data as DeveloperCreateInput, [
        ...this.confirmed(),
      ]);
      this.toast.success('import.created');
      await this.router.navigate(['/developers', d.id, 'edit']);
    } catch (err) {
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }
}
