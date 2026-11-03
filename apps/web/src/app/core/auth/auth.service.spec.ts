import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { permissionsOf, type Me } from '@meridian/shared';
import { AuthService } from './auth.service';

const me = (role: Me['role']): Me => ({
  id: '00000000-0000-7000-8000-000000000000',
  email: 'x@test.local',
  displayName: 'X',
  role,
  locale: 'de',
  totpEnabled: false,
  mustEnrollTotp: false,
  permissions: permissionsOf(role),
  features: { cvAiImport: false },
});

describe('AuthService (UI policy)', () => {
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { de: {}, en: {} } })],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
  });

  it('hides client and approval actions from Egypt', () => {
    auth.setMe(me('egypt_editor'));
    expect(auth.can('client:read')).toBe(false);
    expect(auth.can('developer:approve')).toBe(false);
    expect(
      auth.can('developer:update', { status: 'P1_EINGEREICHT', processingRestricted: false }),
    ).toBe(false);
    expect(
      auth.can('developer:update', { status: 'P1_IN_ERFASSUNG', processingRestricted: false }),
    ).toBe(true);
  });

  it('allows PDF only for Pool 2 in the Austria role', () => {
    auth.setMe(me('austria_reviewer'));
    expect(
      auth.can('pdf:generate', { status: 'P2_FREIGEGEBEN', processingRestricted: false }),
    ).toBe(true);
    expect(
      auth.can('pdf:generate', { status: 'P1_EINGEREICHT', processingRestricted: false }),
    ).toBe(false);
  });

  it('denies everything without a user', () => {
    expect(auth.can('developer:list')).toBe(false);
  });
});
