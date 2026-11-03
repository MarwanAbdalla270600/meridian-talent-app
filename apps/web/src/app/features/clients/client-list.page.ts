import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Client, ClientInput } from '@meridian/shared';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';
import { DialogService } from '../../shared/ui/dialogs';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-client-form-dialog',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="w-[min(94vw,520px)] rounded-2xl bg-white p-6 shadow-2xl" (ngSubmit)="save()">
      <h2 id="cl-title" class="text-lg font-bold">
        {{ (data ? 'clients.edit' : 'clients.new') | transloco }}
      </h2>
      <div class="mt-4 grid gap-3">
        <div>
          <label class="label" for="cl-n">{{ 'clients.name' | transloco }}</label>
          <input id="cl-n" name="name" class="input" required [(ngModel)]="model.name" />
        </div>
        <div>
          <label class="label" for="cl-c">{{ 'clients.contactName' | transloco }}</label>
          <input id="cl-c" name="contact" class="input" [(ngModel)]="model.contactName" />
        </div>
        <div>
          <label class="label" for="cl-e">{{ 'clients.contactEmail' | transloco }}</label>
          <input
            id="cl-e"
            name="email"
            type="email"
            class="input"
            [(ngModel)]="model.contactEmail"
          />
        </div>
        <div>
          <label class="label" for="cl-no">{{ 'clients.note' | transloco }}</label>
          <textarea id="cl-no" name="note" class="input" [(ngModel)]="model.note"></textarea>
        </div>
      </div>
      @if (error()) {
        <p class="field-error mt-3" role="alert">{{ error() }}</p>
      }
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="!model.name.trim()">
          {{ 'common.save' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class ClientFormDialog {
  protected readonly data = inject<Client | undefined>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<Client>>(DialogRef);
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  protected readonly error = signal('');
  protected readonly model = {
    name: this.data?.name ?? '',
    contactName: this.data?.contactName ?? '',
    contactEmail: this.data?.contactEmail ?? '',
    note: this.data?.note ?? '',
  };

  async save() {
    try {
      const body = this.model as ClientInput;
      this.ref.close(
        this.data
          ? await this.api.updateClient(this.data.id, body)
          : await this.api.createClient(body),
      );
    } catch (err) {
      this.error.set(this.errors.message(err));
    }
  }
}

@Component({
  selector: 'app-client-list-page',
  imports: [RouterLink, TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1>{{ 'clients.title' | transloco }}</h1>
        <p class="text-muted">{{ 'clients.subtitle' | transloco }}</p>
      </div>
      <button type="button" class="btn btn-primary" (click)="edit()">
        <app-icon name="plus" [size]="16" />{{ 'clients.new' | transloco }}
      </button>
    </header>
    <div class="card overflow-x-auto p-0">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
            <th scope="col" class="px-4 py-3">{{ 'clients.name' | transloco }}</th>
            <th scope="col" class="px-4 py-3">{{ 'clients.contactName' | transloco }}</th>
            <th scope="col" class="px-4 py-3">{{ 'clients.requests' | transloco }}</th>
            <th scope="col" class="px-4 py-3">
              <span class="sr-only">{{ 'common.actions' | transloco }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          @for (c of clients(); track c.id) {
            <tr class="border-b border-line last:border-0">
              <td class="px-4 py-3 font-semibold">{{ c.name }}</td>
              <td class="px-4 py-3">
                {{ c.contactName || '–' }}
                @if (c.contactEmail) {
                  <span class="block text-xs text-muted">{{ c.contactEmail }}</span>
                }
              </td>
              <td class="px-4 py-3">
                <a routerLink="/requests" class="text-brand hover:underline">{{
                  c.requestCount
                }}</a>
                <span class="text-muted">
                  ({{ c.openRequestCount }} {{ 'clients.openRequests' | transloco }})</span
                >
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" class="btn btn-sm" (click)="edit(c)">
                  {{ 'common.edit' | transloco }}
                </button>
                <button type="button" class="btn btn-sm btn-danger ml-1" (click)="remove(c)">
                  {{ 'common.delete' | transloco }}
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="4" class="px-4 py-10 text-center text-muted">
                {{ 'clients.empty' | transloco }}
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ClientListPage {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  protected readonly clients = signal<Client[]>([]);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.clients.set(await this.api.listClients());
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async edit(c?: Client) {
    const ref = this.dialogs.open<Client, Client | undefined>(ClientFormDialog, {
      data: c,
      ariaLabelledBy: 'cl-title',
      backdropClass: 'bg-black/50',
    });
    if (await firstValueFrom(ref.closed)) {
      this.toast.success('clients.saved');
      await this.load();
    }
  }

  protected async remove(c: Client) {
    const ok = await this.dialogs.confirm({
      title: 'clients.deleteTitle',
      message: 'clients.deleteMessage',
      params: { name: c.name },
      danger: true,
      confirm: 'common.delete',
    });
    if (!ok) return;
    try {
      await this.api.deleteClient(c.id);
      this.toast.success('clients.deleted');
      await this.load();
    } catch (err) {
      this.errors.show(err);
    }
  }
}
