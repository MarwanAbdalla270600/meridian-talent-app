import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { Locale } from '@meridian/shared';

const STORAGE_KEY = 'mt-lang';

/** Current UI language plus locale-aware formatting helpers. */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  readonly lang = signal<Locale>(this.initial());

  private initial(): Locale {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'de' || v === 'en') return v;
    } catch {
      /* storage unavailable */
    }
    return 'de';
  }

  set(lang: Locale) {
    this.lang.set(lang);
    this.transloco.setActiveLang(lang);
    this.document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }

  private get intl() {
    return this.lang() === 'de' ? 'de-AT' : 'en-GB';
  }

  date(iso: string | null | undefined): string {
    if (!iso) return '–';
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    return new Intl.DateTimeFormat(this.intl, { dateStyle: 'medium' }).format(d);
  }

  dateTime(iso: string | null | undefined): string {
    if (!iso) return '–';
    return new Intl.DateTimeFormat(this.intl, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  }

  month(ym: string | null | undefined): string {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return new Intl.DateTimeFormat(this.intl, { month: '2-digit', year: 'numeric' }).format(
      new Date(y!, (m ?? 1) - 1, 1),
    );
  }

  languageName(code: string): string {
    try {
      return new Intl.DisplayNames([this.intl], { type: 'language' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  money(cents: number | null | undefined, currency = 'EUR'): string {
    if (cents === null || cents === undefined) return '–';
    return new Intl.NumberFormat(this.intl, { style: 'currency', currency }).format(cents / 100);
  }
}
