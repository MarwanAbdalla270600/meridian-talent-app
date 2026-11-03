import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-pagination',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (pages() > 1) {
    <nav
      class="mt-5 flex items-center justify-center gap-3 text-sm"
      [attr.aria-label]="'common.pagination' | transloco"
    >
      <button
        type="button"
        class="btn btn-sm"
        [disabled]="page() <= 1"
        (click)="pageChange.emit(page() - 1)"
      >
        {{ 'common.previous' | transloco }}
      </button>
      <span>{{ 'common.pageOf' | transloco: { page: page(), pages: pages() } }}</span>
      <button
        type="button"
        class="btn btn-sm"
        [disabled]="page() >= pages()"
        (click)="pageChange.emit(page() + 1)"
      >
        {{ 'common.next' | transloco }}
      </button>
    </nav>
  }`,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<number>();
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
}
