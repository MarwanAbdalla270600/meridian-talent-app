import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiService, saveBlob, type PdfRequest } from '../../core/api/api.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ErrorService } from '../../core/ui/errors.service';

export interface PdfDialogData {
  /** Developer id, or request id for the combined PDF. */
  id: string;
  mode: 'developer' | 'request';
  filename: string;
}

/** Options for client PDFs: short/long, DE/EN, anonymised (default), hourly rate. */
@Component({
  selector: 'app-pdf-dialog',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="w-[min(92vw,520px)] rounded-2xl bg-white p-6 shadow-2xl" (ngSubmit)="generate()">
      <h2 id="pdf-title" class="text-lg font-bold">
        {{ (data.mode === 'request' ? 'pdf.bundle' : 'pdf.title') | transloco }}
      </h2>
      <p class="mt-1 text-sm text-muted">
        {{ (data.mode === 'request' ? 'pdf.bundleHint' : 'pdf.onlyPool2') | transloco }}
      </p>
      <fieldset class="mt-5">
        <legend class="label">{{ 'pdf.variant' | transloco }}</legend>
        <div class="flex flex-wrap gap-3 text-sm">
          <label class="flex items-center gap-2"
            ><input type="radio" name="variant" value="short" [(ngModel)]="opts.variant" />
            {{ 'pdf.short' | transloco }}</label
          >
          <label class="flex items-center gap-2"
            ><input type="radio" name="variant" value="long" [(ngModel)]="opts.variant" />
            {{ 'pdf.long' | transloco }}</label
          >
        </div>
      </fieldset>
      <fieldset class="mt-4">
        <legend class="label">{{ 'pdf.language' | transloco }}</legend>
        <div class="flex gap-3 text-sm">
          <label class="flex items-center gap-2"
            ><input type="radio" name="lang" value="de" [(ngModel)]="opts.lang" /> Deutsch</label
          >
          <label class="flex items-center gap-2"
            ><input type="radio" name="lang" value="en" [(ngModel)]="opts.lang" /> English</label
          >
        </div>
      </fieldset>
      <div class="mt-4 grid gap-2 text-sm">
        <label class="flex items-start gap-2">
          <input type="checkbox" name="anon" class="mt-1" [(ngModel)]="opts.anonymized" />
          <span
            >{{ 'pdf.anonymized' | transloco
            }}<span class="block text-xs text-muted">{{
              'pdf.anonymizedHint' | transloco
            }}</span></span
          >
        </label>
        <label class="flex items-center gap-2"
          ><input type="checkbox" name="rate" [(ngModel)]="opts.showRate" />
          {{ 'pdf.showRate' | transloco }}</label
        >
      </div>
      <p class="mt-4 text-xs text-muted">{{ 'pdf.logged' | transloco }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn" (click)="ref.close()">
          {{ 'common.close' | transloco }}
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">
          {{ (busy() ? 'pdf.generating' : 'pdf.generate') | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class PdfDialogComponent {
  protected readonly data = inject<PdfDialogData>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  protected readonly busy = signal(false);
  protected readonly opts: PdfRequest = {
    variant: 'short',
    lang: inject(LocaleService).lang(),
    anonymized: true,
    showRate: false,
  };

  async generate() {
    this.busy.set(true);
    try {
      const res =
        this.data.mode === 'request'
          ? await this.api.requestPdf(this.data.id, this.opts)
          : await this.api.developerPdf(this.data.id, this.opts);
      saveBlob(res, `${this.data.filename}-${this.opts.variant}-${this.opts.lang}.pdf`);
    } catch (err) {
      // Blob error bodies need to be parsed before showing the translated message.
      const e = err as { error?: unknown };
      if (e.error instanceof Blob) {
        try {
          e.error = JSON.parse(await e.error.text());
        } catch {
          /* keep original */
        }
      }
      this.errors.show(err);
    } finally {
      this.busy.set(false);
    }
  }
}
