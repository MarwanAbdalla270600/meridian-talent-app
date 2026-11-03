import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Settings } from '@meridian/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorService } from '../../core/ui/errors.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6">
      <h1>{{ 'admin.settings.title' | transloco }}</h1>
      <p class="text-muted">{{ 'admin.settings.subtitle' | transloco }}</p>
    </header>
    @if (model(); as s) {
      <form class="card grid max-w-3xl gap-5" (ngSubmit)="save()">
        <label class="flex items-start gap-3">
          <input
            type="checkbox"
            class="mt-1"
            name="reset"
            [(ngModel)]="s.resetApprovalOnCriticalChange"
          />
          <span
            ><b class="block text-sm">{{ 'admin.settings.resetApproval' | transloco }}</b
            ><span class="text-sm text-muted">{{
              'admin.settings.resetApprovalHint' | transloco
            }}</span></span
          >
        </label>
        <label class="flex items-center gap-3 text-sm font-semibold">
          <input type="checkbox" name="totp" [(ngModel)]="s.requireTotpForPrivileged" />{{
            'admin.settings.requireTotp' | transloco
          }}
        </label>
        <div class="grid gap-3 sm:grid-cols-3">
          <div>
            <label class="label" for="ret">{{
              'admin.settings.retentionMonths' | transloco
            }}</label>
            <input
              id="ret"
              name="ret"
              type="number"
              min="1"
              max="120"
              class="input"
              [(ngModel)]="s.retentionMonths"
            />
          </div>
          <div>
            <label class="label" for="grace">{{
              'admin.settings.consentGraceDays' | transloco
            }}</label>
            <input
              id="grace"
              name="grace"
              type="number"
              min="1"
              max="365"
              class="input"
              [(ngModel)]="s.consentGraceDays"
            />
          </div>
          <div>
            <label class="label" for="cv">{{ 'admin.settings.consentVersion' | transloco }}</label>
            <input id="cv" name="cv" class="input" [(ngModel)]="s.currentConsentVersion" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary">{{ 'common.save' | transloco }}</button>
          <button type="button" class="btn" (click)="runRetention()">
            {{ 'admin.settings.runRetention' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
})
export class SettingsPage {
  private readonly api = inject(ApiService);
  private readonly errors = inject(ErrorService);
  private readonly toast = inject(ToastService);
  protected readonly model = signal<Settings | null>(null);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.model.set(await this.api.getSettings());
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async save() {
    const s = this.model()!;
    try {
      this.model.set(
        await this.api.updateSettings({
          ...s,
          retentionMonths: Number(s.retentionMonths),
          consentGraceDays: Number(s.consentGraceDays),
        }),
      );
      this.toast.success('admin.settings.saved');
    } catch (err) {
      this.errors.show(err);
    }
  }

  protected async runRetention() {
    try {
      const r = await this.api.runRetention();
      this.toast.success('admin.settings.retentionDone', {
        retention: r.flaggedRetention,
        consent: r.flaggedConsent,
      });
    } catch (err) {
      this.errors.show(err);
    }
  }
}
