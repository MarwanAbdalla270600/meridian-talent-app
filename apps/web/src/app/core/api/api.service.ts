import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AuditEntry,
  Client,
  ClientInput,
  DeveloperCreateInput,
  DeveloperDetail,
  DeveloperListItem,
  DeveloperListQuery,
  DeveloperUpdateInput,
  DocumentDto,
  DocumentKind,
  ImportDto,
  ImportReviewSection,
  MatchEntry,
  Me,
  Paginated,
  PdfVariant,
  ProposalStatus,
  RequestDto,
  RequestInput,
  RequestStatus,
  Role,
  Settings,
  Skill,
  StatusEvent,
  User,
} from '@meridian/shared';
import { firstValueFrom } from 'rxjs';

type Query = Record<string, string | number | boolean | undefined | null>;

const params = (q: Query = {}) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  return p;
};

export interface PdfRequest {
  variant: PdfVariant;
  lang: 'de' | 'en';
  anonymized: boolean;
  showRate: boolean;
}

/** Typed API client. Request/response types come from the shared Zod schemas. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  private get<T>(path: string, q?: Query) {
    return firstValueFrom(this.http.get<T>(this.base + path, { params: params(q) }));
  }
  private post<T>(path: string, body: unknown = {}) {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }
  private put<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.put<T>(this.base + path, body));
  }
  private patch<T>(path: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }
  private del<T>(path: string) {
    return firstValueFrom(this.http.delete<T>(this.base + path));
  }
  private blob(path: string, q?: Query) {
    return firstValueFrom(
      this.http.get(this.base + path, {
        params: params(q),
        responseType: 'blob',
        observe: 'response',
      }),
    );
  }

  /* auth */
  csrf = () => this.get<{ token: string }>('/auth/csrf');
  me = () => this.get<Me>('/auth/me');
  login = (email: string, password: string, totp?: string) =>
    this.post<Me>('/auth/login', { email, password, ...(totp ? { totp } : {}) });
  logout = () => this.post<{ ok: true }>('/auth/logout');
  logoutAll = () => this.post<{ ok: true }>('/auth/logout-all');
  updateMe = (locale: 'de' | 'en') => this.patch<Me>('/auth/me', { locale });
  changePassword = (currentPassword: string, newPassword: string) =>
    this.post<{ ok: true }>('/auth/password', { currentPassword, newPassword });
  forgotPassword = (email: string) => this.post<{ ok: true }>('/auth/password/forgot', { email });
  resetPassword = (token: string, newPassword: string) =>
    this.post<{ ok: true }>('/auth/password/reset', { token, newPassword });
  totpSetup = () => this.post<{ secret: string; otpauthUrl: string }>('/auth/totp/setup');
  totpEnable = (code: string) => this.post<Me>('/auth/totp/enable', { code });
  totpDisable = (code: string) => this.post<{ ok: true }>('/auth/totp/disable', { code });

  /* developers */
  listDevelopers = (q: DeveloperListQuery) =>
    this.get<Paginated<DeveloperListItem>>('/developers', q as Query);
  getDeveloper = (id: string) => this.get<DeveloperDetail>(`/developers/${id}`);
  createDeveloper = (body: DeveloperCreateInput) => this.post<DeveloperDetail>('/developers', body);
  updateDeveloper = (id: string, body: DeveloperUpdateInput) =>
    this.put<DeveloperDetail>(`/developers/${id}`, body);
  deleteDeveloper = (id: string) => this.del<{ ok: true }>(`/developers/${id}`);
  transition = (id: string, event: StatusEvent, note?: string) =>
    this.post<DeveloperDetail>(`/developers/${id}/transitions`, {
      event,
      ...(note ? { note } : {}),
    });
  listDocuments = (id: string) => this.get<DocumentDto[]>(`/developers/${id}/documents`);
  uploadDocument = (id: string, file: File, kind: DocumentKind) => {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    return this.post<DocumentDto>(`/developers/${id}/documents`, form);
  };
  downloadUrl = (id: string, docId: string) =>
    this.get<{ url: string; expiresInSeconds: number }>(
      `/developers/${id}/documents/${docId}/download`,
    );
  deleteDocument = (id: string, docId: string) =>
    this.del<{ ok: true }>(`/developers/${id}/documents/${docId}`);
  developerPdf = (id: string, o: PdfRequest) => this.blob(`/developers/${id}/pdf`, { ...o });

  /* skills */
  listSkills = (q?: { q?: string; status?: 'approved' | 'pending' }) =>
    this.get<Skill[]>('/skills', q);
  createSkill = (name: string, category?: string) =>
    this.post<Skill>('/skills', { name, ...(category ? { category } : {}) });
  updateSkill = (
    id: string,
    body: Partial<Pick<Skill, 'name' | 'category' | 'aliases'>> & { status?: 'approved' },
  ) => this.patch<Skill>(`/skills/${id}`, body);
  mergeSkill = (id: string, targetId: string) =>
    this.post<Skill>(`/skills/${id}/merge`, { targetId });
  deleteSkill = (id: string) => this.del<{ ok: true }>(`/skills/${id}`);

  /* clients */
  listClients = () => this.get<Client[]>('/clients');
  createClient = (body: ClientInput) => this.post<Client>('/clients', body);
  updateClient = (id: string, body: ClientInput) => this.put<Client>(`/clients/${id}`, body);
  deleteClient = (id: string) => this.del<{ ok: true }>(`/clients/${id}`);

  /* requests & matching */
  listRequests = (q?: { clientId?: string; status?: RequestStatus }) =>
    this.get<RequestDto[]>('/requests', q);
  getRequest = (id: string) => this.get<RequestDto>(`/requests/${id}`);
  createRequest = (body: RequestInput) => this.post<RequestDto>('/requests', body);
  updateRequest = (id: string, body: RequestInput) => this.put<RequestDto>(`/requests/${id}`, body);
  setRequestStatus = (id: string, status: RequestStatus) =>
    this.patch<RequestDto>(`/requests/${id}/status`, { status });
  deleteRequest = (id: string) => this.del<{ ok: true }>(`/requests/${id}`);
  matches = (id: string) => this.get<MatchEntry[]>(`/requests/${id}/matches`);
  propose = (id: string, developerId: string) =>
    this.post<RequestDto>(`/requests/${id}/proposals`, { developerId });
  unpropose = (id: string, developerId: string) =>
    this.del<RequestDto>(`/requests/${id}/proposals/${developerId}`);
  setProposalStatus = (id: string, developerId: string, status: ProposalStatus) =>
    this.patch<RequestDto>(`/requests/${id}/proposals/${developerId}`, { status });
  requestPdf = (id: string, o: PdfRequest) => this.blob(`/requests/${id}/pdf`, { ...o });

  /* import */
  uploadCv = (file: File) => {
    const form = new FormData();
    form.set('file', file);
    return this.post<ImportDto>('/imports', form);
  };
  getImport = (id: string) => this.get<ImportDto>(`/imports/${id}`);
  confirmImport = (
    id: string,
    developer: DeveloperCreateInput,
    confirmedSections: ImportReviewSection[],
  ) => this.post<DeveloperDetail>(`/imports/${id}/confirm`, { developer, confirmedSections });
  manualImport = (id: string) => this.post<DeveloperDetail>(`/imports/${id}/manual`);

  /* admin */
  listUsers = () => this.get<User[]>('/admin/users');
  createUser = (body: { email: string; displayName: string; role: Role; locale: 'de' | 'en' }) =>
    this.post<User>('/admin/users', body);
  updateUser = (
    id: string,
    body: Partial<Pick<User, 'displayName' | 'role' | 'locale' | 'isActive'>>,
  ) => this.patch<User>(`/admin/users/${id}`, body);
  sendResetLink = (id: string) => this.post<{ ok: true }>(`/admin/users/${id}/reset-link`);
  unlockUser = (id: string) => this.post<User>(`/admin/users/${id}/unlock`);
  resetTotp = (id: string) => this.post<User>(`/admin/users/${id}/reset-totp`);
  audit = (q: Query) => this.get<Paginated<AuditEntry>>('/admin/audit', q);
  getSettings = () => this.get<Settings>('/admin/settings');
  updateSettings = (body: Partial<Settings>) => this.patch<Settings>('/admin/settings', body);
  gdprExport = (id: string, format: 'json' | 'pdf') =>
    this.blob(`/admin/gdpr/developers/${id}/export`, { format });
  gdprErase = (id: string, confirm: string) =>
    this.post<{ ok: true }>(`/admin/gdpr/developers/${id}/erase`, { confirm });
  gdprRestrict = (id: string, restricted: boolean, reason?: string) =>
    this.post<DeveloperDetail>(`/admin/gdpr/developers/${id}/restriction`, {
      restricted,
      ...(reason ? { reason } : {}),
    });
  gdprUnflag = (id: string) => this.post<DeveloperDetail>(`/admin/gdpr/developers/${id}/unflag`);
  runRetention = () =>
    this.post<{ flaggedRetention: number; flaggedConsent: number }>('/admin/gdpr/retention/run');
}

/** Triggers a browser download for a blob response. */
export function saveBlob(
  res: { body: Blob | null; headers: { get(name: string): string | null } },
  fallback: string,
) {
  if (!res.body) return;
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]+)"/.exec(cd);
  const name = m?.[1] ? decodeURIComponent(m[1]) : fallback;
  const url = URL.createObjectURL(res.body);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
