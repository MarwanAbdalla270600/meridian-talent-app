import type { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'developers' },
      {
        path: 'developers',
        loadComponent: () =>
          import('./features/developers/developer-list.page').then((m) => m.DeveloperListPage),
      },
      {
        path: 'developers/new',
        canActivate: [permissionGuard('developer:create')],
        loadComponent: () =>
          import('./features/developers/developer-form.page').then((m) => m.DeveloperFormPage),
      },
      {
        path: 'developers/:id',
        loadComponent: () =>
          import('./features/developers/developer-detail.page').then((m) => m.DeveloperDetailPage),
      },
      {
        path: 'developers/:id/edit',
        loadComponent: () =>
          import('./features/developers/developer-form.page').then((m) => m.DeveloperFormPage),
      },
      {
        path: 'requests',
        canActivate: [permissionGuard('request:read')],
        loadComponent: () =>
          import('./features/requests/request-list.page').then((m) => m.RequestListPage),
      },
      {
        path: 'clients',
        canActivate: [permissionGuard('client:read')],
        loadComponent: () =>
          import('./features/clients/client-list.page').then((m) => m.ClientListPage),
      },
      {
        path: 'import',
        canActivate: [permissionGuard('import:cv')],
        loadComponent: () => import('./features/import/import.page').then((m) => m.ImportPage),
      },
      {
        path: 'admin/users',
        canActivate: [permissionGuard('user:manage')],
        loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'admin/skills',
        canActivate: [permissionGuard('skill:manage')],
        loadComponent: () => import('./features/admin/skills.page').then((m) => m.SkillsPage),
      },
      {
        path: 'admin/audit',
        canActivate: [permissionGuard('audit:read')],
        loadComponent: () => import('./features/admin/audit.page').then((m) => m.AuditPage),
      },
      {
        path: 'admin/settings',
        canActivate: [permissionGuard('settings:manage')],
        loadComponent: () => import('./features/admin/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'account',
        loadComponent: () => import('./features/auth/account.page').then((m) => m.AccountPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
