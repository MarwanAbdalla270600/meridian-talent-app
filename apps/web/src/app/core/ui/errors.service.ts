import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { toApiError } from '../api/api-error';
import { ToastService } from './toast.service';

/** Shows an API error as a translated toast (`errors.<CODE>`), falling back to a generic text. */
@Injectable({ providedIn: 'root' })
export class ErrorService {
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  message(err: unknown): string {
    const e = toApiError(err);
    const key = `errors.${e.code}`;
    const text = this.t.translate(key);
    return text === key ? this.t.translate('errors.INTERNAL') : text;
  }

  show(err: unknown) {
    const e = toApiError(err);
    this.toast.show('error', this.message(err), undefined, e.requestId || undefined);
  }
}
