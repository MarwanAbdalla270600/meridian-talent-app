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
import {
  formatBelowLevel,
  PROPOSAL_STATUSES,
  REQUEST_STATUSES,
  type Client,
  type MatchEntry,
  type ProposalStatus,
  type RequestDto,
  type RequestStatus,
  type Skill,
} from '@meridian/shared';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarComponent } from '../../shared/ui/badges';
import { DialogService } from '../../shared/ui/dialogs';
import { IconComponent } from '../../shared/ui/icon.component';
import { PdfDialogComponent, type PdfDialogData } from '../developers/pdf-dialog.component';
import { RequestFormDialog, type RequestFormData } from './request-form.dialog';

@Component({
  selector: 'app-request-list-page',
  imports: [RouterLink, TranslocoPipe, AvatarComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1>{{ 'requests.title' | transloco }}</h1>
        <p class="text-muted">{{ 'requests.subtitle' | transloco }}</p>
      </div>
      <button type="button" class="btn btn-primary" (click)="edit()" [disabled]="!clients().length">
        <app-icon name="plus" [size]="16" />{{ 'requests.new' | transloco }}
      </button>
    </header>

    <div class="grid items-start gap-4 lg:grid-cols-[340px_1fr]">
      <nav class="card p-2" [attr.aria-label]="'requests.select' | transloco">
        @for (r of requests(); track r.id) {
          <a
            [routerLink]="[]"
            [queryParams]="{ id: r.id }"
            class="block rounded-xl p-3 hover:bg-slate-50"
            [class.!bg-brand-light]="r.id === selectedId()"
            [attr.aria-current]="r.id === selectedId() ? 'true' : null"
          >
            <b class="block">{{ r.title }}</b>
            <span class="text-sm text-muted">{{ r.clientName }}</span>
            <span class="mt-1.5 flex flex-wrap gap-1.5">
              <span
                class="tag"
                [class.tag-ok]="r.status === 'won'"
                [class.tag-warn]="r.status === 'open'"
                [class.tag-muted]="r.status === 'lost'"
                >{{ 'requestStatus.' + r.status | transloco }}</span
              >
              @if (r.seniority) {
                <span class="tag tag-muted">{{ 'seniority.' + r.seniority | transloco }}</span>
              }
              @if (r.proposals.length) {
                <span class="tag"
                  >{{ r.proposals.length }} {{ 'requests.proposals' | transloco }}</span
                >
              }
            </span>
          </a>
        } @empty {
          <p class="p-6 text-center text-sm text-muted">{{ 'requests.empty' | transloco }}</p>
        }
      </nav>

      @if (selected(); as r) {
        <section class="card" aria-labelledby="rq-h">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="rq-h" class="text-xl font-bold">{{ r.title }}</h2>
              <p class="text-sm text-muted">
                {{ r.clientName }} · {{ 'requests.startBy' | transloco }}
                {{ r.startBy ? locale.date(r.startBy) : ('requests.noStart' | transloco) }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="sr-only" for="rq-status">{{ 'requests.status' | transloco }}</label>
              <select
                id="rq-status"
                class="input w-auto"
                [value]="r.status"
                (change)="setStatus($any($event.target).value)"
              >
                @for (s of statuses; track s) {
                  <option [value]="s" [selected]="s === r.status">
                    {{ 'requestStatus.' + s | transloco }}
                  </option>
                }
              </select>
              <button type="button" class="btn btn-sm" (click)="edit(r)">
                {{ 'common.edit' | transloco }}
              </button>
              <button
                type="button"
                class="btn btn-sm"
                (click)="bundlePdf(r)"
                [disabled]="!r.proposals.length"
              >
                <app-icon name="print" [size]="14" />{{ 'pdf.bundle' | transloco }}
              </button>
              <button type="button" class="btn btn-sm btn-danger" (click)="remove(r)">
                {{ 'common.delete' | transloco }}
              </button>
            </div>
          </div>
          @if (r.note) {
            <p class="mt-3 text-sm whitespace-pre-line">{{ r.note }}</p>
          }
          <h3 class="section-title mt-5">{{ 'requests.skills' | transloco }}</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (s of r.skills; track s.skillId) {
              <span class="chip"
                >{{ s.name }} · {{ 'requests.minLevel' | transloco }} {{ s.minLevel }}</span
              >
            }
          </div>

          @if (r.proposals.length) {
            <h3 class="section-title mt-6">{{ 'requests.proposals' | transloco }}</h3>
            <ul class="grid gap-2">
              @for (p of r.proposals; track p.developerId) {
                <li class="flex flex-wrap items-center gap-3 text-sm">
                  <a
                    [routerLink]="['/developers', p.developerId]"
                    class="font-semibold text-brand hover:underline"
                    >{{ p.name }}</a
                  >
                  <span class="text-muted">{{ p.title }}</span>
                  <label class="sr-only" [for]="'ps-' + p.developerId">{{
                    'requests.status' | transloco
                  }}</label>
                  <select
                    [id]="'ps-' + p.developerId"
                    class="input ml-auto w-auto py-1"
                    [value]="p.status"
                    (change)="setProposalStatus(p.developerId, $any($event.target).value)"
                  >
                    @for (s of proposalStatuses; track s) {
                      <option [value]="s" [selected]="s === p.status">
                        {{ 'proposalStatus.' + s | transloco }}
                      </option>
                    }
                  </select>
                </li>
              }
            </ul>
          }

          <h3 class="section-title mt-6">{{ 'requests.matching' | transloco }}</h3>
          <p class="-mt-2 mb-2 text-xs text-muted">{{ 'requests.onlyApproved' | transloco }}</p>
          <ol class="divide-y divide-line">
            @for (m of matches(); track m.developerId) {
              <li class="grid items-center gap-3 py-3.5 sm:grid-cols-[44px_1fr_180px_auto]">
                <app-avatar [name]="m.name" [seed]="m.publicRef" [size]="44" />
                <div class="min-w-0">
                  <a
                    [routerLink]="['/developers', m.developerId]"
                    class="font-bold hover:text-brand"
                    >{{ m.name }}</a
                  >
                  <span class="text-sm text-muted"> · {{ m.title }}</span>
                  <div class="mt-1 flex flex-wrap gap-1.5 text-xs">
                    @if (!m.availableInTime) {
                      <span class="tag tag-warn"
                        >{{ 'requests.late' | transloco }} ({{
                          locale.date(m.availableFrom)
                        }})</span
                      >
                    }
                    @if (m.seniorityMatch) {
                      <span class="tag tag-ok">{{ 'requests.seniorityMatch' | transloco }}</span>
                    }
                    @if (m.isPlaced) {
                      <span class="tag tag-muted">{{ 'developer.placed' | transloco }}</span>
                    }
                    @if (m.missing.length) {
                      <span class="font-semibold text-danger"
                        >{{ 'requests.missing' | transloco }}: {{ m.missing.join(', ') }}</span
                      >
                    }
                    @if (m.belowLevel.length) {
                      <span class="font-semibold text-warn"
                        >{{ 'requests.below' | transloco }}: {{ below(m) }}</span
                      >
                    }
                  </div>
                </div>
                <div>
                  <span
                    class="text-xl font-bold"
                    [class.text-ok]="m.score >= 80"
                    [class.text-brand]="m.score >= 50 && m.score < 80"
                    [class.text-muted]="m.score < 50"
                    >{{ m.score }}&nbsp;%</span
                  >
                  <div
                    class="h-2 overflow-hidden rounded-full bg-slate-200"
                    role="meter"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="m.score"
                    [attr.aria-label]="'requests.score' | transloco"
                  >
                    <div
                      class="h-full rounded-full"
                      [class.bg-ok]="m.score >= 80"
                      [class.bg-brand]="m.score < 80"
                      [style.width.%]="m.score"
                    ></div>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm"
                  [class.btn-primary]="!m.proposed"
                  (click)="toggle(m)"
                >
                  {{ (m.proposed ? 'requests.proposed' : 'requests.propose') | transloco
                  }}{{ m.proposed ? ' ✓' : '' }}
                </button>
              </li>
            } @empty {
              <li class="py-6 text-center text-sm text-muted">
                {{ 'requests.noMatches' | transloco }}
              </li>
            }
          </ol>
        </section>
      }
    </div>
  `,
})
export class RequestListPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly locale = inject(LocaleService);

  readonly id = input<string>();
  protected readonly statuses = REQUEST_STATUSES;
  protected readonly proposalStatuses = PROPOSAL_STATUSES;
  protected readonly requests = signal<RequestDto[]>([]);
  protected readonly clients = signal<Client[]>([]);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly matches = signal<MatchEntry[]>([]);
  protected readonly selectedId = computed(() => this.selected()?.id ?? null);
  protected readonly selected = computed(
    () =>
      (this.requests().find((r) => r.id === this.id()) ??
        this.requests()[0] ??
        null) as RequestDto | null,
  );

  constructor() {
    void this.loadAll();
    effect(() => {
      const r = this.selected();
      untracked(() => (r ? void this.loadMatches(r.id) : this.matches.set([])));
    });
  }

  protected below = (m: MatchEntry) => m.belowLevel.map(formatBelowLevel).join(', ');

  private async loadAll() {
    try {
      const [requests, clients, skills] = await Promise.all([
        this.api.listRequests(),
        this.api.listClients(),
        this.api.listSkills({ status: 'approved' }),
      ]);
      this.requests.set(requests);
      this.clients.set(clients);
      this.skills.set(skills);
    } catch (err) {
      this.errors.show(err);
    }
  }

  private async loadMatches(id: string) {
    try {
      this.matches.set(await this.api.matches(id));
    } catch (err) {
      this.errors.show(err);
    }
  }

  private replace(r: RequestDto) {
    this.requests.update((list) =>
      list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [r, ...list],
    );
  }

  protected async toggle(m: MatchEntry) {
    const r = this.selected()!;
    try {
      const updated = m.proposed
        ? await this.api.unpropose(r.id, m.developerId)
        : await this.api.propose(r.id, m.developerId);
      this.replace(updated);
      await this.loadMatches(r.id);
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async setStatus(status: RequestStatus) {
    try {
      this.replace(await this.api.setRequestStatus(this.selected()!.id, status));
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async setProposalStatus(developerId: string, status: ProposalStatus) {
    try {
      this.replace(await this.api.setProposalStatus(this.selected()!.id, developerId, status));
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async edit(request?: RequestDto) {
    const ref = this.dialogs.open<RequestDto, RequestFormData>(RequestFormDialog, {
      data: { request, clients: this.clients(), skills: this.skills() },
      ariaLabelledBy: 'rq-title',
      backdropClass: 'bg-black/50',
    });
    const saved = await firstValueFrom(ref.closed);
    if (!saved) return;
    this.replace(saved);
    this.toast.success('requests.saved');
    await this.router.navigate([], { queryParams: { id: saved.id } });
    await this.loadMatches(saved.id);
  }

  protected bundlePdf(r: RequestDto) {
    this.dialogs.open<unknown, PdfDialogData>(PdfDialogComponent, {
      data: {
        id: r.id,
        mode: 'request',
        filename: `anfrage-${r.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      },
      ariaLabelledBy: 'pdf-title',
      backdropClass: 'bg-black/50',
    });
  }

  protected async remove(r: RequestDto) {
    const ok = await this.dialogs.confirm({
      title: 'requests.deleteTitle',
      message: 'requests.deleteMessage',
      params: { title: r.title },
      danger: true,
      confirm: 'common.delete',
    });
    if (!ok) return;
    try {
      await this.api.deleteRequest(r.id);
      this.requests.update((l) => l.filter((x) => x.id !== r.id));
      this.toast.success('requests.deleted');
      await this.router.navigate([], { queryParams: { id: null } });
    } catch (err) {
      this.errors.show(err);
    }
  }
}
