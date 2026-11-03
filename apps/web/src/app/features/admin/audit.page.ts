import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { AuditEntry, Paginated } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { PaginationComponent } from '../../shared/ui/pagination.component';

@Component({
  selector: 'app-audit-page',
  imports: [FormsModule, JsonPipe, TranslocoPipe, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1>{{ 'admin.audit.title' | transloco }}</h1>
      <p class="text-muted">{{ 'admin.audit.subtitle' | transloco }}</p>
    </header>
    <form class="card mb-4 grid items-end gap-3 md:grid-cols-5" (ngSubmit)="load(1)">
      <div>
        <label class="label" for="a-act">{{ 'admin.audit.action' | transloco }}</label>
        <input
          id="a-act"
          name="action"
          class="input"
          placeholder="developer.status"
          [(ngModel)]="filter.action"
        />
      </div>
      <div>
        <label class="label" for="a-ent">{{ 'admin.audit.entity' | transloco }}</label>
        <select id="a-ent" name="entity" class="input" [(ngModel)]="filter.entity">
          <option value="">{{ 'common.all' | transloco }}</option>
          @for (e of entities; track e) {
            <option [value]="e">{{ e }}</option>
          }
        </select>
      </div>
      <div>
        <label class="label" for="a-from">{{ 'admin.audit.from' | transloco }}</label>
        <input id="a-from" name="from" type="date" class="input" [(ngModel)]="filter.from" />
      </div>
      <div>
        <label class="label" for="a-to">{{ 'admin.audit.to' | transloco }}</label>
        <input id="a-to" name="to" type="date" class="input" [(ngModel)]="filter.to" />
      </div>
      <button type="submit" class="btn btn-primary">{{ 'admin.audit.filter' | transloco }}</button>
    </form>
    @if (page(); as p) {
      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-left text-xs text-muted uppercase">
              <th scope="col" class="px-4 py-3">{{ 'admin.audit.when' | transloco }}</th>
              <th scope="col" class="px-4 py-3">{{ 'admin.audit.actor' | transloco }}</th>
              <th scope="col" class="px-4 py-3">{{ 'admin.audit.action' | transloco }}</th>
              <th scope="col" class="px-4 py-3">{{ 'admin.audit.entity' | transloco }}</th>
              <th scope="col" class="px-4 py-3">{{ 'admin.audit.details' | transloco }}</th>
            </tr>
          </thead>
          <tbody>
            @for (e of p.items; track e.id) {
              <tr class="border-b border-line align-top last:border-0">
                <td class="px-4 py-2 whitespace-nowrap">{{ locale.dateTime(e.createdAt) }}</td>
                <td class="px-4 py-2">
                  {{ e.actorName ?? ('admin.audit.system' | transloco) }}
                  @if (e.ip) {
                    <span class="block text-xs text-muted">{{ e.ip }}</span>
                  }
                </td>
                <td class="px-4 py-2">
                  <code class="text-xs">{{ e.action }}</code>
                </td>
                <td class="px-4 py-2">
                  {{ e.entity
                  }}<span class="block font-mono text-[11px] text-muted">{{
                    e.entityId?.slice(0, 8)
                  }}</span>
                </td>
                <td class="px-4 py-2">
                  @if (e.diff) {
                    <details>
                      <summary class="cursor-pointer text-brand">
                        {{ 'admin.audit.details' | transloco }}
                      </summary>
                      <pre
                        class="mt-1 max-w-xl overflow-auto rounded bg-slate-50 p-2 text-[11px]"
                        >{{ e.diff | json }}</pre>
                    </details>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-4 py-10 text-center text-muted">
                  {{ 'admin.audit.empty' | transloco }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pagination
        [page]="p.page"
        [total]="p.total"
        [pageSize]="p.pageSize"
        (pageChange)="load($event)"
      />
    }
  `,
})
export class AuditPage {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  protected readonly locale = inject(LocaleService);
  protected readonly entities = [
    'developer',
    'document',
    'request',
    'client',
    'skill',
    'user',
    'settings',
  ];
  protected readonly page = signal<Paginated<AuditEntry> | null>(null);
  protected filter = { action: '', entity: '', from: '', to: '' };

  constructor() {
    void this.load(1);
  }

  async load(page: number) {
    try {
      this.page.set(await this.api.audit({ ...this.filter, page, pageSize: 50 }));
    } catch (err) {
      this.errors.show(err);
    }
  }
}
