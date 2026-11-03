import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SKILL_CATEGORIES, type Skill, type SkillCategory } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { DialogService } from '../../shared/ui/dialogs';

@Component({
  selector: 'app-skills-page',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1>{{ 'admin.skills.title' | transloco }}</h1>
      <p class="text-muted">{{ 'admin.skills.subtitle' | transloco }}</p>
    </header>

    <section class="card mb-5" aria-labelledby="pend-h">
      <h2 id="pend-h" class="section-title">
        {{ 'admin.skills.pending' | transloco }} ({{ pending().length }})
      </h2>
      @for (s of pending(); track s.id) {
        <div class="flex flex-wrap items-center gap-2 border-t border-line py-2 first:border-0">
          <b class="min-w-40">{{ s.name }}</b>
          <span class="text-xs text-muted"
            >{{ 'admin.skills.usage' | transloco }}: {{ s.usageCount }}</span
          >
          <label class="sr-only" [for]="'cat-' + s.id">{{
            'admin.skills.category' | transloco
          }}</label>
          <select
            [id]="'cat-' + s.id"
            class="input ml-auto w-auto py-1"
            [value]="s.category"
            (change)="setCategory(s, $any($event.target).value)"
          >
            @for (c of categories; track c) {
              <option [value]="c">{{ 'category.' + c | transloco }}</option>
            }
          </select>
          <button type="button" class="btn btn-sm btn-primary" (click)="approve(s)">
            {{ 'admin.skills.approve' | transloco }}
          </button>
          <label class="sr-only" [for]="'mg-' + s.id">{{
            'admin.skills.target' | transloco
          }}</label>
          <select
            [id]="'mg-' + s.id"
            class="input w-auto py-1"
            (change)="merge(s, $any($event.target).value); $any($event.target).value = ''"
          >
            <option value="">{{ 'admin.skills.merge' | transloco }}</option>
            @for (t of approved(); track t.id) {
              <option [value]="t.id">{{ t.name }}</option>
            }
          </select>
        </div>
      } @empty {
        <p class="text-sm text-muted">{{ 'admin.skills.noPending' | transloco }}</p>
      }
    </section>

    <section class="card" aria-labelledby="cat-h">
      <h2 id="cat-h" class="section-title">
        {{ 'admin.skills.all' | transloco }} ({{ approved().length }})
      </h2>
      <form class="mb-4 flex flex-wrap items-end gap-2" (ngSubmit)="create()">
        <div>
          <label class="label" for="ns">{{ 'admin.skills.name' | transloco }}</label>
          <input id="ns" name="ns" class="input" [(ngModel)]="newName" />
        </div>
        <div>
          <label class="label" for="nc">{{ 'admin.skills.category' | transloco }}</label>
          <select id="nc" name="nc" class="input" [(ngModel)]="newCategory">
            @for (c of categories; track c) {
              <option [value]="c">{{ 'category.' + c | transloco }}</option>
            }
          </select>
        </div>
        <button type="submit" class="btn" [disabled]="!newName.trim()">
          {{ 'admin.skills.new' | transloco }}
        </button>
      </form>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-left text-xs text-muted uppercase">
              <th scope="col" class="py-2 pr-3">{{ 'admin.skills.name' | transloco }}</th>
              <th scope="col" class="py-2 pr-3">{{ 'admin.skills.category' | transloco }}</th>
              <th scope="col" class="py-2 pr-3">{{ 'admin.skills.aliases' | transloco }}</th>
              <th scope="col" class="py-2 pr-3">{{ 'admin.skills.usage' | transloco }}</th>
              <th scope="col">
                <span class="sr-only">{{ 'common.actions' | transloco }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (s of approved(); track s.id) {
              <tr class="border-b border-line last:border-0">
                <td class="py-2 pr-3 font-medium">{{ s.name }}</td>
                <td class="py-2 pr-3">{{ 'category.' + s.category | transloco }}</td>
                <td class="py-2 pr-3">
                  <label class="sr-only" [for]="'al-' + s.id"
                    >{{ 'admin.skills.aliases' | transloco }}: {{ s.name }}</label
                  >
                  <input
                    [id]="'al-' + s.id"
                    class="input py-1"
                    [value]="s.aliases.join(', ')"
                    (change)="setAliases(s, $any($event.target).value)"
                  />
                </td>
                <td class="py-2 pr-3">{{ s.usageCount }}</td>
                <td class="py-2 text-right">
                  @if (s.usageCount === 0) {
                    <button type="button" class="btn btn-sm btn-danger" (click)="remove(s)">
                      {{ 'common.delete' | transloco }}
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class SkillsPage {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly categories = SKILL_CATEGORIES;
  protected readonly skills = signal<Skill[]>([]);
  protected readonly pending = computed(() => this.skills().filter((s) => s.status === 'pending'));
  protected readonly approved = computed(() =>
    this.skills().filter((s) => s.status === 'approved'),
  );
  protected newName = '';
  protected newCategory: SkillCategory = 'other';

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.skills.set(await this.api.listSkills());
    } catch (err) {
      this.errors.show(err);
    }
  }

  private async act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      this.toast.success(msg);
      await this.load();
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected approve = (s: Skill) =>
    this.act(() => this.api.updateSkill(s.id, { status: 'approved' }), 'admin.skills.approved');
  protected setCategory = (s: Skill, category: SkillCategory) =>
    this.act(() => this.api.updateSkill(s.id, { category }), 'admin.skills.saved');
  protected setAliases = (s: Skill, raw: string) =>
    this.act(
      () =>
        this.api.updateSkill(s.id, {
          aliases: raw
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
        }),
      'admin.skills.saved',
    );
  protected create = () =>
    this.act(async () => {
      await this.api.createSkill(this.newName.trim(), this.newCategory);
      this.newName = '';
    }, 'admin.skills.saved');

  protected async merge(s: Skill, targetId: string) {
    if (!targetId) return;
    const target = this.skills().find((t) => t.id === targetId);
    const ok = await this.dialogs.confirm({
      title: 'admin.skills.mergeTitle',
      message: 'admin.skills.mergeMessage',
      params: { name: `${s.name} → ${target?.name}` },
    });
    if (ok) await this.act(() => this.api.mergeSkill(s.id, targetId), 'admin.skills.merged');
  }

  protected async remove(s: Skill) {
    if (
      await this.dialogs.confirm({
        title: 'common.delete',
        message: s.name,
        danger: true,
        confirm: 'common.delete',
      })
    ) {
      await this.act(() => this.api.deleteSkill(s.id), 'admin.skills.deleted');
    }
  }
}
