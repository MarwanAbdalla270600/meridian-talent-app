import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DOCUMENT_KINDS, type DocumentDto, type DocumentKind } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { DialogService } from '../../shared/ui/dialogs';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-documents-panel',
  imports: [FormsModule, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="docs-h">
      <h2 id="docs-h" class="section-title">{{ 'documents.title' | transloco }}</h2>
      @if (docs().length) {
        <ul class="grid gap-2">
          @for (d of docs(); track d.id) {
            <li class="flex items-center gap-2 text-sm">
              <app-icon name="file" [size]="16" />
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left font-medium text-brand hover:underline"
                (click)="download(d)"
              >
                {{ d.filename }}
              </button>
              <span class="tag tag-muted">{{ 'documents.kind.' + d.kind | transloco }}</span>
              @if (d.virusScanStatus === 'infected') {
                <span class="tag tag-danger">{{ 'documents.scan.infected' | transloco }}</span>
              }
              @if (canEdit()) {
                <button
                  type="button"
                  class="text-muted hover:text-danger"
                  (click)="remove(d)"
                  [attr.aria-label]="('common.delete' | transloco) + ': ' + d.filename"
                >
                  <app-icon name="trash" [size]="16" />
                </button>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-sm text-muted">{{ 'documents.empty' | transloco }}</p>
      }
      @if (canEdit()) {
        <div class="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <div>
            <label class="label" for="doc-kind">{{ 'documents.kindLabel' | transloco }}</label>
            <select id="doc-kind" class="input" [(ngModel)]="kind">
              @for (k of kinds; track k) {
                <option [value]="k">{{ 'documents.kind.' + k | transloco }}</option>
              }
            </select>
          </div>
          <label class="btn btn-sm cursor-pointer">
            <app-icon name="upload" [size]="16" />{{ 'documents.upload' | transloco }}
            <input
              type="file"
              class="sr-only"
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              (change)="upload($event)"
              [disabled]="busy()"
            />
          </label>
          <p class="w-full text-xs text-muted">{{ 'documents.hint' | transloco: { mb: 10 } }}</p>
        </div>
      }
    </section>
  `,
})
export class DocumentsPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly locale = inject(LocaleService);

  readonly developerId = input.required<string>();
  readonly canEdit = input(false);
  protected readonly docs = signal<DocumentDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly kinds = DOCUMENT_KINDS;
  protected kind: DocumentKind = 'cv';

  ngOnInit() {
    void this.reload();
  }

  async reload() {
    try {
      this.docs.set(await this.api.listDocuments(this.developerId()));
    } catch (err) {
      this.errors.show(err);
    }
  }

  async upload(ev: Event) {
    const el = ev.target as HTMLInputElement;
    const file = el.files?.[0];
    if (!file) return;
    this.busy.set(true);
    try {
      await this.api.uploadDocument(this.developerId(), file, this.kind);
      this.toast.success('documents.uploaded');
      await this.reload();
    } catch (err) {
      this.errors.show(err);
    } finally {
      el.value = '';
      this.busy.set(false);
    }
  }

  async download(d: DocumentDto) {
    try {
      const { url } = await this.api.downloadUrl(this.developerId(), d.id);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      this.errors.show(err);
    }
  }

  async remove(d: DocumentDto) {
    const ok = await this.dialogs.confirm({
      title: 'documents.deleteTitle',
      message: 'documents.deleteMessage',
      params: { name: d.filename },
      danger: true,
      confirm: 'common.delete',
    });
    if (!ok) return;
    try {
      await this.api.deleteDocument(this.developerId(), d.id);
      this.toast.success('documents.deleted');
      await this.reload();
    } catch (err) {
      this.errors.show(err);
    }
  }
}
