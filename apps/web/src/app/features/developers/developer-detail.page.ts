import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DeveloperDetail, StatusEvent } from '@meridian/shared';
import { ApiService, saveBlob } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  AvatarComponent,
  fullName,
  SkillLevelComponent,
  StatusBadgeComponent,
} from '../../shared/ui/badges';
import { DialogService } from '../../shared/ui/dialogs';
import { IconComponent } from '../../shared/ui/icon.component';
import { PhaseIndicatorComponent } from '../../shared/ui/phase-indicator.component';
import { DocumentsPanelComponent } from './documents-panel.component';
import { PdfDialogComponent, type PdfDialogData } from './pdf-dialog.component';

@Component({
  selector: 'app-developer-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    AvatarComponent,
    StatusBadgeComponent,
    SkillLevelComponent,
    PhaseIndicatorComponent,
    IconComponent,
    DocumentsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/developers"
      class="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-brand"
    >
      <app-icon name="back" [size]="16" />{{ 'common.back' | transloco }}
    </a>
    @if (dev(); as d) {
      <header class="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <app-avatar [name]="name()" [seed]="d.publicRef" [size]="64" />
          <div>
            <h1>{{ name() }}</h1>
            <p class="text-muted">
              {{ d.title || '–' }} · {{ 'developer.ref' | transloco }} {{ ref() }}
            </p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <app-status-badge [status]="d.status" [placed]="d.isPlaced" />
              <span class="tag tag-muted">{{ 'seniority.' + d.seniority | transloco }}</span>
              @if (availableNow()) {
                <span class="tag tag-ok">{{ 'developer.availableNow' | transloco }}</span>
              } @else {
                <span class="tag tag-warn">{{ locale.date(d.availableFrom) }}</span>
              }
              @if (d.processingRestricted) {
                <span class="tag tag-danger">{{ 'developer.restricted' | transloco }}</span>
              }
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (d.canEdit) {
            <a [routerLink]="['/developers', d.id, 'edit']" class="btn">{{
              'common.edit' | transloco
            }}</a>
          }
          @for (e of d.allowedEvents; track e) {
            <button
              type="button"
              class="btn"
              [class.btn-primary]="e === 'submit' || e === 'approve'"
              (click)="run(e)"
              [disabled]="busy()"
            >
              {{ 'actions.' + e | transloco }}
            </button>
          }
          @if (d.status === 'P2_FREIGEGEBEN' && auth.can('pdf:generate', policy())) {
            <button type="button" class="btn btn-primary" (click)="openPdf()">
              <app-icon name="print" [size]="16" />{{ 'developer.clientProfile' | transloco }}
            </button>
          }
          @if (auth.can('developer:delete')) {
            <button type="button" class="btn btn-danger" (click)="remove()">
              {{ 'common.delete' | transloco }}
            </button>
          }
        </div>
      </header>

      <app-phase-indicator [status]="d.status" />
      @if (d.reviewNote && d.status === 'P1_IN_ERFASSUNG') {
        <p
          class="mt-3 rounded-xl border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger"
          role="note"
        >
          <b>{{ 'developer.reviewNote' | transloco }}:</b> {{ d.reviewNote }}
        </p>
      }
      @if (d.status === 'P1_EINGEREICHT' && !d.canEdit) {
        <p
          class="mt-3 flex items-center gap-2 rounded-xl bg-warn-light px-4 py-3 text-sm text-warn"
          role="note"
        >
          <app-icon name="lock" [size]="16" />{{ 'developer.locked' | transloco }}
        </p>
      }
      @if (d.deletionFlaggedAt) {
        <p class="mt-3 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger" role="note">
          {{ 'gdpr.flagged' | transloco: { date: locale.date(d.deletionFlaggedAt) } }} –
          {{ 'gdpr.flagReason.' + d.deletionFlagReason | transloco }}
        </p>
      }

      <div class="mt-5 grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <article class="card grid gap-6">
          <section aria-labelledby="sum-h">
            <h2 id="sum-h" class="section-title">{{ 'developer.summary' | transloco }}</h2>
            <p class="whitespace-pre-line">
              {{ summary() || ('developer.noSummary' | transloco) }}
            </p>
          </section>
          <section aria-labelledby="sk-h">
            <h2 id="sk-h" class="section-title">{{ 'developer.skills' | transloco }}</h2>
            @if (d.skills.length) {
              <ul class="grid gap-1.5">
                @for (s of d.skills; track s.skillId) {
                  <li class="grid grid-cols-[1fr_110px_60px] items-center gap-3 text-sm">
                    <span>
                      {{ s.name }}
                      @if (s.skillStatus === 'pending') {
                        <span
                          class="tag tag-warn ml-1"
                          [title]="'developer.pendingSkill' | transloco"
                          >?</span
                        >
                      }
                    </span>
                    <app-skill-level [level]="s.level" />
                    <span class="text-muted">{{
                      'developer.years' | transloco: { years: s.years }
                    }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-muted">{{ 'developer.noEntries' | transloco }}</p>
            }
          </section>
          <section aria-labelledby="ex-h">
            <h2 id="ex-h" class="section-title">{{ 'developer.experience' | transloco }}</h2>
            @for (e of d.experiences; track e.id) {
              <div class="border-t border-line py-3 first:border-0 first:pt-0">
                <b>{{ e.role }}</b>
                <p class="text-sm text-muted">
                  {{ e.company }} · {{ locale.month(e.fromDate) }} –
                  {{ e.toDate ? locale.month(e.toDate) : ('developer.present' | transloco) }}
                </p>
                @if (desc(e); as text) {
                  <p class="mt-1 text-sm whitespace-pre-line">{{ text }}</p>
                }
              </div>
            } @empty {
              <p class="text-sm text-muted">{{ 'developer.noEntries' | transloco }}</p>
            }
          </section>
        </article>

        <div class="grid gap-4">
          @if (d.status !== 'P2_FREIGEGEBEN') {
            <section class="card" aria-labelledby="ck-h">
              <h2 id="ck-h" class="section-title">{{ 'developer.checklist' | transloco }}</h2>
              <ul class="grid gap-1.5 text-sm">
                @for (c of d.checklist; track c.key) {
                  <li class="flex items-center gap-2" [class.text-muted]="!c.ok">
                    <span
                      class="grid size-5 place-items-center rounded-full text-[11px] font-bold"
                      [class.bg-ok]="c.ok"
                      [class.text-white]="c.ok"
                      [class.bg-slate-200]="!c.ok"
                      aria-hidden="true"
                      >{{ c.ok ? '✓' : '' }}</span
                    >
                    <span class="sr-only"
                      >{{ (c.ok ? 'common.yes' : 'common.no') | transloco }}:</span
                    >
                    {{ 'checklist.' + c.key | transloco }}
                  </li>
                }
              </ul>
              <p class="mt-3 text-xs text-muted">{{ 'developer.notReady' | transloco }}</p>
            </section>
          }

          <section class="card" aria-labelledby="facts-h">
            <h2 id="facts-h" class="section-title">{{ 'developer.facts' | transloco }}</h2>
            <dl class="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt class="text-muted">{{ 'developer.location' | transloco }}</dt>
              <dd>{{ d.location || '–' }}</dd>
              <dt class="text-muted">{{ 'developer.availableFrom' | transloco }}</dt>
              <dd>
                {{
                  availableNow() ? ('developer.availNow' | transloco) : locale.date(d.availableFrom)
                }}
              </dd>
              @if (d.hourlyRateCents !== undefined) {
                <dt class="text-muted">{{ 'developer.rate' | transloco }}</dt>
                <dd>{{ locale.money(d.hourlyRateCents, d.currency) }}</dd>
              }
              <dt class="text-muted">{{ 'developer.education' | transloco }}</dt>
              <dd>
                {{
                  (locale.lang() === 'en'
                    ? d.educationEn || d.educationDe
                    : d.educationDe || d.educationEn) || '–'
                }}
              </dd>
              <dt class="text-muted">{{ 'developer.email' | transloco }}</dt>
              <dd class="break-all">{{ d.email || '–' }}</dd>
              <dt class="text-muted">{{ 'developer.phone' | transloco }}</dt>
              <dd>{{ d.phone || '–' }}</dd>
            </dl>
            @if (d.approvedAt) {
              <p class="mt-3 text-xs text-muted">
                {{
                  'developer.approvedBy'
                    | transloco: { name: d.approvedByName ?? '–', date: locale.date(d.approvedAt) }
                }}
              </p>
            }
          </section>

          <section class="card" aria-labelledby="lang-h">
            <h2 id="lang-h" class="section-title">{{ 'developer.languages' | transloco }}</h2>
            @for (l of d.languages; track l.language) {
              <div class="flex justify-between py-0.5 text-sm">
                <span>{{ locale.languageName(l.language) }}</span
                ><span class="tag">{{ 'languageLevel.' + l.level | transloco }}</span>
              </div>
            } @empty {
              <p class="text-sm text-muted">–</p>
            }
            <h2 class="section-title mt-5">{{ 'developer.certifications' | transloco }}</h2>
            @for (c of d.certifications; track c.id) {
              <p class="py-0.5 text-sm">
                {{ c.name }}
                @if (c.issuer || c.year) {
                  <span class="text-muted"> · {{ certMeta(c) }}</span>
                }
              </p>
            } @empty {
              <p class="text-sm text-muted">–</p>
            }
          </section>

          <section class="card" aria-labelledby="int-h">
            <h2 id="int-h" class="section-title">{{ 'developer.internalNote' | transloco }}</h2>
            <p class="mb-2 text-xs text-muted">{{ 'developer.internalHint' | transloco }}</p>
            <p class="text-sm whitespace-pre-line">{{ d.internalNote || '–' }}</p>
            <p class="mt-3 text-sm">
              @if (d.consentGiven) {
                <span class="tag tag-ok">{{ 'developer.consentGiven' | transloco }}</span>
                <span class="ml-2 text-xs text-muted"
                  >{{ locale.date(d.consentAt) }} · v{{ d.consentVersion || '–' }}</span
                >
              } @else {
                <span class="tag tag-warn">{{ 'developer.consentMissing' | transloco }}</span>
              }
            </p>
          </section>

          <app-documents-panel
            [developerId]="d.id"
            [canEdit]="auth.can('document:upload', policy())"
          />

          @if (d.history.length) {
            <section class="card" aria-labelledby="hist-h">
              <h2 id="hist-h" class="section-title">{{ 'developer.history' | transloco }}</h2>
              <ol class="grid gap-2 text-sm">
                @for (h of d.history; track h.id) {
                  <li>
                    <b>{{ h.actorName || '–' }}</b>
                    @if (h.actorRole) {
                      <span class="text-muted"> ({{ 'roles.' + h.actorRole | transloco }})</span>
                    }
                    ·
                    {{
                      (h.fromStatus ? 'historyEvent.' + h.toStatus : 'historyEvent.created')
                        | transloco
                    }}
                    <span class="text-muted">· {{ locale.dateTime(h.createdAt) }}</span>
                    @if (h.note) {
                      <span class="mt-0.5 block text-muted italic">„{{ h.note }}“</span>
                    }
                  </li>
                }
              </ol>
            </section>
          }

          @if (auth.can('gdpr:export')) {
            <section class="card border-danger/30" aria-labelledby="gdpr-h">
              <h2 id="gdpr-h" class="section-title">{{ 'gdpr.title' | transloco }}</h2>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn btn-sm" (click)="exportData('json')">
                  {{ 'gdpr.exportJson' | transloco }}
                </button>
                <button type="button" class="btn btn-sm" (click)="exportData('pdf')">
                  {{ 'gdpr.exportPdf' | transloco }}
                </button>
                <button type="button" class="btn btn-sm" (click)="toggleRestriction()">
                  {{ (d.processingRestricted ? 'gdpr.lift' : 'gdpr.restrict') | transloco }}
                </button>
                @if (d.deletionFlaggedAt) {
                  <button type="button" class="btn btn-sm" (click)="unflag()">
                    {{ 'gdpr.unflag' | transloco }}
                  </button>
                }
                <button type="button" class="btn btn-sm btn-danger" (click)="erase()">
                  {{ 'gdpr.erase' | transloco }}
                </button>
              </div>
              @if (d.processingRestricted && d.restrictionReason) {
                <p class="mt-2 text-xs text-muted">
                  {{ 'gdpr.restrictReason' | transloco }}: {{ d.restrictionReason }}
                </p>
              }
            </section>
          }
        </div>
      </div>
    } @else {
      <p class="py-16 text-center text-muted">{{ 'common.loading' | transloco }}</p>
    }
  `,
})
export class DeveloperDetailPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);

  readonly id = input.required<string>();
  protected readonly dev = signal<DeveloperDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly name = computed(() => (this.dev() ? fullName(this.dev()!) : ''));
  protected readonly ref = computed(
    () => `#${String(this.dev()?.publicRef ?? 0).padStart(3, '0')}`,
  );
  protected readonly policy = computed(() => {
    const d = this.dev();
    return d ? { status: d.status, processingRestricted: d.processingRestricted } : undefined;
  });
  protected readonly availableNow = computed(() => {
    const a = this.dev()?.availableFrom;
    return !a || a <= new Date().toISOString().slice(0, 10);
  });
  protected readonly summary = computed(() => {
    const d = this.dev();
    if (!d) return '';
    return this.locale.lang() === 'en' ? d.summaryEn || d.summaryDe : d.summaryDe || d.summaryEn;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected certMeta(c: DeveloperDetail['certifications'][number]) {
    return [c.issuer, c.year].filter((x) => x !== null && x !== '').join(', ');
  }

  protected desc(e: DeveloperDetail['experiences'][number]) {
    return this.locale.lang() === 'en'
      ? e.descriptionEn || e.descriptionDe
      : e.descriptionDe || e.descriptionEn;
  }

  private async load(id: string) {
    try {
      this.dev.set(await this.api.getDeveloper(id));
    } catch (err) {
      this.errors.show(err);
      await this.router.navigateByUrl('/developers');
    }
  }

  protected async run(event: StatusEvent) {
    const d = this.dev()!;
    let note: string | undefined;
    if (event === 'return' || event === 'demote') {
      const r = await this.dialogs.prompt({
        title: `actions.${event}Title`,
        message: `actions.${event}Message`,
        prompt: { label: `actions.${event}Prompt`, required: event === 'return' },
        confirm: `actions.${event}`,
      });
      if (r === null) return;
      note = r || undefined;
    } else if (
      !(await this.dialogs.confirm({
        title: `actions.${event}Title`,
        message: `actions.${event}Message`,
        confirm: `actions.${event}`,
      }))
    ) {
      return;
    }
    this.busy.set(true);
    try {
      this.dev.set(await this.api.transition(d.id, event, note));
      this.toast.success(`actions.${event}_done`);
    } catch (err) {
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected openPdf() {
    const d = this.dev()!;
    this.dialogs.open<unknown, PdfDialogData>(PdfDialogComponent, {
      data: {
        id: d.id,
        mode: 'developer',
        filename: `profil-${String(d.publicRef).padStart(3, '0')}`,
      },
      ariaLabelledBy: 'pdf-title',
      backdropClass: 'bg-black/50',
    });
  }

  protected async remove() {
    const ok = await this.dialogs.confirm({
      title: 'actions.deleteTitle',
      message: 'actions.deleteMessage',
      danger: true,
      confirm: 'common.delete',
    });
    if (!ok) return;
    try {
      await this.api.deleteDeveloper(this.dev()!.id);
      this.toast.success('actions.deleted');
      await this.router.navigateByUrl('/developers');
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async exportData(format: 'json' | 'pdf') {
    try {
      saveBlob(await this.api.gdprExport(this.dev()!.id, format), `datenauskunft.${format}`);
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async toggleRestriction() {
    const d = this.dev()!;
    try {
      if (d.processingRestricted) {
        this.dev.set(await this.api.gdprRestrict(d.id, false));
        this.toast.success('gdpr.lifted');
      } else {
        const reason = await this.dialogs.prompt({
          title: 'gdpr.restrictTitle',
          message: 'gdpr.restrictMessage',
          prompt: { label: 'gdpr.restrictReason', required: true },
          confirm: 'gdpr.restrict',
        });
        if (reason === null) return;
        this.dev.set(await this.api.gdprRestrict(d.id, true, reason));
        this.toast.success('gdpr.restricted');
      }
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async unflag() {
    try {
      this.dev.set(await this.api.gdprUnflag(this.dev()!.id));
      this.toast.success('gdpr.unflagged');
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async erase() {
    const ref = this.ref();
    const ok = await this.dialogs.confirm({
      title: 'gdpr.eraseTitle',
      message: 'gdpr.eraseMessage',
      danger: true,
      typeToConfirm: ref,
      confirm: 'gdpr.erase',
    });
    if (!ok) return;
    try {
      await this.api.gdprErase(this.dev()!.id, ref);
      this.toast.success('gdpr.erased');
      await this.router.navigateByUrl('/developers');
    } catch (err) {
      this.errors.show(err);
    }
  }
}
