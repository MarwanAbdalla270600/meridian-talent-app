import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { csrfInterceptor } from './csrf.interceptor';

describe('csrfInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([csrfInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    document.cookie = 'mt_csrf=; max-age=0; path=/';
    ctrl.verify();
  });

  it('adds the token to unsafe API requests', () => {
    document.cookie = 'mt_csrf=abc.def; path=/';
    http.post('/api/x', {}).subscribe();
    expect(ctrl.expectOne('/api/x').request.headers.get('X-CSRF-Token')).toBe('abc.def');
  });

  it('does not add the token to GET requests or foreign URLs', () => {
    document.cookie = 'mt_csrf=abc.def; path=/';
    http.get('/api/x').subscribe();
    expect(ctrl.expectOne('/api/x').request.headers.has('X-CSRF-Token')).toBe(false);
    http.post('https://other.example/api/x', {}).subscribe();
    expect(ctrl.expectOne('https://other.example/api/x').request.headers.has('X-CSRF-Token')).toBe(
      false,
    );
  });
});
