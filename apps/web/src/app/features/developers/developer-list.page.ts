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
import { SENIORITIES, type DeveloperListItem, type Paginated, type Skill } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { AvatarComponent, fullName, StatusBadgeComponent } from '../../shared/ui/badges';
import { IconComponent } from '../../shared/ui/icon.component';
import { PaginationComponent } from '../../shared/ui/pagination.component';

const PAGE_SIZE = 24;

@Component({
  selector: 'app-developer-list-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    AvatarComponent,
    StatusBadgeComponent,
    IconComponent,
    PaginationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1>{{ 'developer.listTitle' | transloco }}</h1>
        <p class="text-muted">{{ 'developer.listSubtitle' | transloco }}</p>
      </div>
      @if (auth.can('developer:create')) {
        <a routerLink="/developers/new" class="btn btn-primary"
          ><app-icon name="plus" [size]="16" />{{ 'developer.new' | transloco }}</a
        >
      }
    </header>

    <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Kennzahlen">
      @for (s of stats(); track s.label) {
        <div class="card py-4">
          <b class="block text-3xl font-bold tracking-tight">{{ s.value ?? '–' }}</b>
          <span class="text-sm text-muted">{{ s.label | transloco }}</span>
        </div>
      }
    </section>

    <div class="mb-3 flex flex-wrap gap-2" role="tablist">
      @for (p of pools; track p.key) {
        <button
          type="button"
          role="tab"
          class="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold"
          [class.bg-ink]="(pool() ?? '') === p.key"
          [class.text-white]="(pool() ?? '') === p.key"
          [class.border-ink]="(pool() ?? '') === p.key"
          [class.border-line2]="(pool() ?? '') !== p.key"
          [class.bg-white]="(pool() ?? '') !== p.key"
          [attr.aria-selected]="(pool() ?? '') === p.key"
          (click)="set({ pool: p.key || null })"
        >
          {{ p.label | transloco }}
        </button>
      }
    </div>

    <section class="card" [attr.aria-label]="'common.search' | transloco">
      <div class="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <label class="sr-only" for="q">{{ 'developer.searchLabel' | transloco }}</label>
          <input
            id="q"
            type="search"
            class="input"
            [placeholder]="'developer.searchPlaceholder' | transloco"
            [value]="q() ?? ''"
            (input)="onSearch($any($event.target).value)"
          />
        </div>
        <div>
          <label class="sr-only" for="sen">{{ 'form.seniority' | transloco }}</label>
          <select
            id="sen"
            class="input"
            [value]="seniority() ?? ''"
            (change)="set({ seniority: $any($event.target).value || null })"
          >
            <option value="">{{ 'developer.allLevels' | transloco }}</option>
            @for (s of seniorities; track s) {
              <option [value]="s" [selected]="s === seniority()">
                {{ 'seniority.' + s | transloco }}
              </option>
            }
          </select>
        </div>
        <div>
          <label class="sr-only" for="av">{{ 'developer.availableFrom' | transloco }}</label>
          <select
            id="av"
            class="input"
            [value]="availability() ?? ''"
            (change)="set({ availability: $any($event.target).value || null })"
          >
            <option value="">{{ 'developer.allAvailability' | transloco }}</option>
            <option value="now" [selected]="availability() === 'now'">
              {{ 'developer.availNow' | transloco }}
            </option>
            <option value="30" [selected]="availability() === '30'">
              {{ 'developer.avail30' | transloco }}
            </option>
          </select>
        </div>
        <div>
          <label class="sr-only" for="sort">{{ 'developer.sortBy' | transloco }}</label>
          <select
            id="sort"
            class="input"
            [value]="sort() ?? 'updated'"
            (change)="set({ sort: $any($event.target).value })"
          >
            @for (s of sorts; track s) {
              <option [value]="s" [selected]="s === (sort() ?? 'updated')">
                {{ 'developer.sort.' + s | transloco }}
              </option>
            }
          </select>
        </div>
      </div>
      <fieldset class="mt-4">
        <legend class="label">
          {{ 'developer.skillFilter' | transloco }}
          <span class="font-normal">({{ 'developer.skillFilterHint' | transloco }})</span>
        </legend>
        <div class="flex flex-wrap gap-1.5">
          @for (s of filterSkills(); track s.id) {
            <button
              type="button"
              class="chip hover:border-brand"
              [class.!bg-brand]="selectedSkills().includes(s.id)"
              [class.!text-white]="selectedSkills().includes(s.id)"
              [class.!border-brand]="selectedSkills().includes(s.id)"
              [attr.aria-pressed]="selectedSkills().includes(s.id)"
              (click)="toggleSkill(s.id)"
            >
              {{ s.name }}
            </button>
          }
        </div>
      </fieldset>
    </section>

    @if (result(); as r) {
      <p class="mt-4 text-sm text-muted" aria-live="polite">
        {{ 'common.total' | transloco: { count: r.total } }}
      </p>
      @if (r.items.length) {
        <ul class="mt-3 grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          @for (d of r.items; track d.id) {
            <li>
              <a
                [routerLink]="['/developers', d.id]"
                class="flex h-full flex-col gap-3 rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
              >
                <div class="flex items-center gap-3">
                  <app-avatar [name]="name(d)" [seed]="d.publicRef" />
                  <div class="min-w-0">
                    <h2 class="truncate text-base font-bold">{{ name(d) }}</h2>
                    <p class="truncate text-sm text-muted">{{ d.title || '–' }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <app-status-badge [status]="d.status" [placed]="d.isPlaced" />
                  <span class="tag tag-muted">{{ 'seniority.' + d.seniority | transloco }}</span>
                  @if (isAvailableNow(d.availableFrom)) {
                    <span class="tag tag-ok">{{ 'developer.availableNow' | transloco }}</span>
                  } @else {
                    <span class="tag tag-warn">{{ locale.date(d.availableFrom) }}</span>
                  }
                  @if (!d.consentGiven) {
                    <span class="tag tag-warn">{{ 'developer.consentMissing' | transloco }}</span>
                  }
                  @if (d.processingRestricted) {
                    <span class="tag tag-danger">{{ 'developer.restricted' | transloco }}</span>
                  }
                  @if (d.deletionFlaggedAt) {
                    <span class="tag tag-danger">{{ 'developer.flagged' | transloco }}</span>
                  }
                </div>
                <div class="flex flex-wrap gap-1">
                  @for (s of d.topSkills; track s) {
                    <span class="chip">{{ s }}</span>
                  }
                  @if (d.skillCount > d.topSkills.length) {
                    <span class="chip">+{{ d.skillCount - d.topSkills.length }}</span>
                  }
                </div>
              </a>
            </li>
          }
        </ul>
        <app-pagination
          [page]="r.page"
          [total]="r.total"
          [pageSize]="r.pageSize"
          (pageChange)="set({ page: $event })"
        />
      } @else {
        <p class="py-16 text-center text-muted">{{ 'developer.noResults' | transloco }}</p>
      }
    } @else {
      <p class="py-16 text-center text-muted">{{ 'common.loading' | transloco }}</p>
    }
  `,
})
export class DeveloperListPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly errors = inject(ErrorService);
  protected readonly auth = inject(AuthService);
  protected readonly locale = inject(LocaleService);

  // Bound from query parameters (withComponentInputBinding).
  readonly q = input<string>();
  readonly pool = input<'p1' | 'p2'>();
  readonly seniority = input<string>();
  readonly availability = input<'now' | '30'>();
  readonly skills = input<string>();
  readonly sort = input<'updated' | 'name' | 'available' | 'seniority'>();
  readonly page = input<string>();

  protected readonly seniorities = SENIORITIES;
  protected readonly sorts = ['updated', 'name', 'available', 'seniority'] as const;
  protected readonly pools = [
    { key: '', label: 'common.all' },
    { key: 'p1', label: 'pool.p1' },
    { key: 'p2', label: 'pool.p2' },
  ] as const;

  protected readonly result = signal<Paginated<DeveloperListItem> | null>(null);
  protected readonly allSkills = signal<Skill[]>([]);
  protected readonly stats = signal<{ label: string; value: number | null }[]>([]);
  protected readonly selectedSkills = computed(() =>
    (this.skills() ?? '').split(',').filter(Boolean),
  );
  protected readonly filterSkills = computed(() =>
    this.allSkills().filter((s) => s.usageCount > 0 || this.selectedSkills().includes(s.id)),
  );
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;

  protected readonly name = fullName;

  constructor() {
    effect(() => {
      const query = {
        q: this.q() || undefined,
        pool: this.pool() || undefined,
        seniority: (this.seniority() || undefined) as never,
        availability: this.availability() || undefined,
        skills: this.skills() || undefined,
        sort: this.sort() || 'updated',
        dir:
          this.sort() === 'name' || this.sort() === 'available'
            ? ('asc' as const)
            : ('desc' as const),
        page: Number(this.page() ?? 1) || 1,
        pageSize: PAGE_SIZE,
      };
      untracked(() => void this.load(query));
    });
    void this.loadStatic();
  }

  private async load(query: Parameters<ApiService['listDevelopers']>[0]) {
    const mine = ++this.seq;
    try {
      const r = await this.api.listDevelopers(query);
      if (mine === this.seq) this.result.set(r);
    } catch (err) {
      this.errors.show(err);
    }
  }

  private async loadStatic() {
    try {
      const [skills, p2, now, review, p1] = await Promise.all([
        this.api.listSkills(),
        this.api.listDevelopers({ pool: 'p2', pageSize: 1 }),
        this.api.listDevelopers({ pool: 'p2', availability: 'now', pageSize: 1 }),
        this.api.listDevelopers({ status: 'P1_EINGEREICHT', pageSize: 1 }),
        this.api.listDevelopers({ pool: 'p1', pageSize: 1 }),
      ]);
      this.allSkills.set(skills);
      this.stats.set([
        { label: 'developer.statsPool2', value: p2.total },
        { label: 'developer.statsAvailable', value: now.total },
        { label: 'developer.statsReview', value: review.total },
        { label: 'developer.statsPool1', value: p1.total },
      ]);
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected set(patch: Record<string, string | number | null>) {
    const queryParams = { ...patch, ...('page' in patch ? {} : { page: null }) };
    void this.router.navigate([], {
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: !('page' in patch),
    });
  }

  protected onSearch(value: string) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.set({ q: value.trim() || null }), 300);
  }

  protected toggleSkill(id: string) {
    const cur = this.selectedSkills();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    this.set({ skills: next.join(',') || null });
  }

  protected isAvailableNow(date: string | null) {
    return !date || date <= new Date().toISOString().slice(0, 10);
  }
}
