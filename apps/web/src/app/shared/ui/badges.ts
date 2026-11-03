import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DeveloperStatus } from '@meridian/shared';

const COLORS = [
  '#2F6BFF',
  '#6B3FE0',
  '#0B7F7F',
  '#C2502A',
  '#A8306A',
  '#2E7D32',
  '#8A6400',
  '#3F4FC4',
];

@Component({
  selector: 'app-status-badge',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
      class="tag"
      [class.tag-warn]="status() === 'P1_IN_ERFASSUNG'"
      [class.tag-ok]="status() === 'P2_FREIGEGEBEN'"
      >{{ 'status.' + status() | transloco }}</span
    >
    @if (placed()) {
      <span class="tag tag-muted ml-1">{{ 'developer.placed' | transloco }}</span>
    }`,
})
export class StatusBadgeComponent {
  readonly status = input.required<DeveloperStatus>();
  readonly placed = input(false);
}

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `<div
    class="grid place-items-center rounded-xl font-bold text-white"
    [style.background]="color()"
    [style.width.px]="size()"
    [style.height.px]="size()"
    [style.font-size.px]="size() / 2.8"
  >
    {{ initials() }}
  </div>`,
})
export class AvatarComponent {
  readonly name = input<string>('');
  readonly seed = input<number>(0);
  readonly size = input(44);
  protected readonly initials = computed(
    () =>
      this.name()
        .split(/\s+/)
        .filter(Boolean)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || '–',
  );
  protected readonly color = computed(() => COLORS[this.seed() % COLORS.length]);
}

/** Skill level 1–5 as segmented bar with an accessible text alternative. */
@Component({
  selector: 'app-skill-level',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="flex gap-1"
    role="img"
    [attr.aria-label]="'developer.levelOf' | transloco: { level: level() }"
  >
    @for (i of [1, 2, 3, 4, 5]; track i) {
      <span
        class="h-1.5 w-4 rounded-full"
        [class.bg-brand]="i <= level()"
        [class.bg-line]="i > level()"
      ></span>
    }
  </span>`,
})
export class SkillLevelComponent {
  readonly level = input.required<number>();
}

export const fullName = (d: { firstName: string | null; lastName: string | null }) =>
  [d.firstName, d.lastName].filter(Boolean).join(' ') || '–';
