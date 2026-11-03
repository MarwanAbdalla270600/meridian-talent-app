import {
  provideHttpClient,
  withFetch,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { sessionInterceptor } from './core/api/http.interceptor';
import { LocaleService } from './core/i18n/locale.service';
import { TranslocoHttpLoader } from './core/i18n/transloco.loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Apply the stored UI language before the first render.
    provideAppInitializer(() => {
      const locale = inject(LocaleService);
      locale.set(locale.lang());
    }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(
      withFetch(),
      // Angular echoes the CSRF cookie in the header for every state-changing same-origin request.
      withXsrfConfiguration({ cookieName: 'mt_csrf', headerName: 'X-CSRF-Token' }),
      withInterceptors([sessionInterceptor]),
    ),
    provideTransloco({
      config: {
        availableLangs: ['de', 'en'],
        defaultLang: 'de',
        fallbackLang: 'de',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: isDevMode() },
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
