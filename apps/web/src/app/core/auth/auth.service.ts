import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { can, type Action, type DeveloperPolicyContext, type Me } from '@meridian/shared';
import { ApiService } from '../api/api.service';
import { LocaleService } from '../i18n/locale.service';
import { clearDrafts } from '../../shared/drafts';

/**
 * Holds the current user. UI permission checks use the same shared policy as the
 * API – but only to hide controls; the API always enforces.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);

  readonly me = signal<Me | null>(null);
  readonly loaded = signal(false);
  readonly isLoggedIn = computed(() => !!this.me());
  readonly role = computed(() => this.me()?.role ?? null);

  async load(): Promise<Me | null> {
    if (this.loaded()) return this.me();
    try {
      await this.api.csrf();
      const me = await this.api.me();
      this.setMe(me);
    } catch {
      this.me.set(null);
    } finally {
      this.loaded.set(true);
    }
    return this.me();
  }

  setMe(me: Me) {
    this.me.set(me);
    this.loaded.set(true);
    this.locale.set(me.locale);
  }

  async login(email: string, password: string, totp?: string) {
    const me = await this.api.login(email, password, totp);
    this.setMe(me);
    return me;
  }

  async logout(all = false) {
    try {
      await (all ? this.api.logoutAll() : this.api.logout());
    } finally {
      this.clearLocal();
      await this.router.navigateByUrl('/login');
    }
  }

  /** Called when the API reports the session is gone. */
  clearLocal() {
    clearDrafts();
    this.me.set(null);
  }

  can(action: Action, dev?: DeveloperPolicyContext): boolean {
    const r = this.role();
    return !!r && can(r, action, dev);
  }
}
