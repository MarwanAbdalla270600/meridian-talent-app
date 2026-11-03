import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  confirm?: string;
  danger?: boolean;
  /** When set, the user must type this text to confirm (destructive actions). */
  typeToConfirm?: string;
  /** When set, a text input is shown and its value is returned. */
  prompt?: { label: string; required: boolean };
  params?: Record<string, unknown>;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="w-[min(92vw,480px)] rounded-2xl bg-white p-6 shadow-2xl" (ngSubmit)="ok()">
      <h2 class="text-lg font-bold" id="dlg-title">{{ data.title | transloco: data.params }}</h2>
      <p class="mt-2 text-sm text-muted">{{ data.message | transloco: data.params }}</p>
      @if (data.prompt) {
        <label class="label mt-4" for="dlg-input">{{ data.prompt.label | transloco }}</label>
        <textarea
          id="dlg-input"
          class="input min-h-24"
          name="text"
          [ngModel]="text()"
          (ngModelChange)="text.set($event)"
          [required]="data.prompt.required"
          cdkFocusInitial
        ></textarea>
      }
      @if (data.typeToConfirm) {
        <label class="label mt-4" for="dlg-confirm">{{
          'common.typeToConfirm' | transloco: { text: data.typeToConfirm }
        }}</label>
        <input
          id="dlg-confirm"
          class="input"
          name="confirm"
          [ngModel]="typed()"
          (ngModelChange)="typed.set($event)"
          autocomplete="off"
        />
      }
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn" (click)="ref.close(undefined)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          type="submit"
          class="btn btn-primary"
          [class.!bg-danger]="data.danger"
          [class.!border-danger]="data.danger"
          [disabled]="!valid()"
        >
          {{ data.confirm ?? 'common.confirm' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string | boolean | undefined>>(DialogRef);
  protected readonly text = signal('');
  protected readonly typed = signal('');
  protected readonly valid = computed(() => {
    const promptOk = !this.data.prompt?.required || this.text().trim().length > 0;
    const typeOk = !this.data.typeToConfirm || this.typed() === this.data.typeToConfirm;
    return promptOk && typeOk;
  });

  ok() {
    if (!this.valid()) return;
    this.ref.close(this.data.prompt ? this.text().trim() : true);
  }
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  async confirm(data: ConfirmData): Promise<boolean> {
    const ref = this.dialog.open<string | boolean | undefined, ConfirmData>(
      ConfirmDialogComponent,
      {
        data,
        ariaLabelledBy: 'dlg-title',
        backdropClass: 'bg-black/50',
      },
    );
    return (await firstValueFrom(ref.closed)) === true;
  }

  async prompt(data: ConfirmData): Promise<string | null> {
    const ref = this.dialog.open<string | boolean | undefined, ConfirmData>(
      ConfirmDialogComponent,
      {
        data,
        ariaLabelledBy: 'dlg-title',
        backdropClass: 'bg-black/50',
      },
    );
    const r = await firstValueFrom(ref.closed);
    return typeof r === 'string' ? r : null;
  }

  open = this.dialog.open.bind(this.dialog);
}
