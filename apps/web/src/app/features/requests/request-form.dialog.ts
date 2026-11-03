import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  REQUEST_STATUSES,
  SENIORITIES,
  type Client,
  type RequestDto,
  type RequestInput,
  type Skill,
} from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorService } from '../../core/ui/errors.service';

export interface RequestFormData {
  request?: RequestDto;
  clients: Client[];
  skills: Skill[];
}

@Component({
  selector: 'app-request-form-dialog',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="max-h-[90vh] w-[min(94vw,640px)] overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
      (ngSubmit)="save()"
    >
      <h2 id="rq-title" class="text-lg font-bold">
        {{ (data.request ? 'requests.edit' : 'requests.new') | transloco }}
      </h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label" for="rq-t">{{ 'requests.titleField' | transloco }}</label>
          <input id="rq-t" name="title" class="input" required [(ngModel)]="model.title" />
        </div>
        <div>
          <label class="label" for="rq-c">{{ 'requests.client' | transloco }}</label>
          <select id="rq-c" name="client" class="input" required [(ngModel)]="model.clientId">
            @for (c of data.clients; track c.id) {
              <option [value]="c.id">{{ c.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="label" for="rq-s">{{ 'requests.seniority' | transloco }}</label>
          <select id="rq-s" name="sen" class="input" [(ngModel)]="model.seniority">
            <option [ngValue]="null">{{ 'requests.anyLevel' | transloco }}</option>
            @for (s of seniorities; track s) {
              <option [ngValue]="s">{{ 'seniority.' + s | transloco }}</option>
            }
          </select>
        </div>
        <div>
          <label class="label" for="rq-d">{{ 'requests.startBy' | transloco }}</label>
          <input id="rq-d" name="start" type="date" class="input" [(ngModel)]="startBy" />
        </div>
        <div>
          <label class="label" for="rq-st">{{ 'requests.status' | transloco }}</label>
          <select id="rq-st" name="status" class="input" [(ngModel)]="model.status">
            @for (s of statuses; track s) {
              <option [value]="s">{{ 'requestStatus.' + s | transloco }}</option>
            }
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="rq-n">{{ 'requests.note' | transloco }}</label>
          <textarea id="rq-n" name="note" class="input" [(ngModel)]="note"></textarea>
        </div>
      </div>
      <fieldset class="mt-4">
        <legend class="label">{{ 'requests.skills' | transloco }}</legend>
        @for (s of model.skills; track $index; let i = $index) {
          <div class="mb-2 grid grid-cols-[1fr_110px_40px] gap-2">
            <label class="sr-only" [for]="'rqs-' + i">{{ 'form.skill' | transloco }}</label>
            <select [id]="'rqs-' + i" class="input" [name]="'sk' + i" [(ngModel)]="s.skillId">
              @for (k of data.skills; track k.id) {
                <option [value]="k.id">{{ k.name }}</option>
              }
            </select>
            <label class="sr-only" [for]="'rql-' + i">{{ 'requests.minLevel' | transloco }}</label>
            <select [id]="'rql-' + i" class="input" [name]="'lv' + i" [(ngModel)]="s.minLevel">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <option [ngValue]="n">{{ 'requests.minLevel' | transloco }} {{ n }}</option>
              }
            </select>
            <button
              type="button"
              class="btn btn-sm btn-danger"
              (click)="model.skills.splice(i, 1)"
              [attr.aria-label]="'common.remove' | transloco"
            >
              ×
            </button>
          </div>
        }
        <button
          type="button"
          class="btn btn-sm"
          (click)="model.skills.push({ skillId: data.skills[0]?.id ?? '', minLevel: 3 })"
        >
          {{ 'requests.addSkill' | transloco }}
        </button>
      </fieldset>
      @if (error()) {
        <p class="field-error mt-3" role="alert">{{ error() }}</p>
      }
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="busy()">
          {{ 'common.save' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class RequestFormDialog {
  protected readonly data = inject<RequestFormData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<RequestDto>>(DialogRef);
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly t = inject(TranslocoService);
  protected readonly seniorities = SENIORITIES;
  protected readonly statuses = REQUEST_STATUSES;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly model: RequestInput;
  protected startBy: string;
  protected note: string;

  constructor() {
    const r = this.data.request;
    this.model = {
      clientId: r?.clientId ?? this.data.clients[0]?.id ?? '',
      title: r?.title ?? '',
      seniority: r?.seniority ?? null,
      startBy: r?.startBy ?? null,
      status: r?.status ?? 'open',
      note: r?.note ?? null,
      skills: r?.skills.map((s) => ({ skillId: s.skillId, minLevel: s.minLevel })) ?? [],
    };
    this.startBy = this.model.startBy ?? '';
    this.note = this.model.note ?? '';
  }

  async save() {
    if (!this.model.skills.length) {
      this.error.set(this.t.translate('requests.needSkill'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const body: RequestInput = {
        ...this.model,
        startBy: this.startBy || null,
        note: this.note || null,
      };
      const saved = this.data.request
        ? await this.api.updateRequest(this.data.request.id, body)
        : await this.api.createRequest(body);
      this.ref.close(saved);
    } catch (err) {
      this.error.set(this.errors.message(err));
    } finally {
      this.busy.set(false);
    }
  }
}
