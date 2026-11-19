import { Routes } from '@angular/router';
import { CalendarPageComponent } from './features/calendar/calendar-page/calendar-page.component';
import { UnauthorizedPageComponent } from './features/auth/unauthorized-page.component';
import { authGuard } from './core/guards/auth.guard';
import { devGuard } from './core/guards/dev.guard';

export const routes: Routes = [
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page/admin-page.component').then(m => m.AdminPageComponent),
    canActivate: [authGuard, devGuard],
  },
  {
    path: 'calendario/:view/:date',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'calendario',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'tarefas/:boardId',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'tarefas',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'mural/:boardId',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'mural',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'calendario',
    pathMatch: 'full',
  },
  {
    path: 'unauthorized',
    component: UnauthorizedPageComponent,
  },
  { path: '**', redirectTo: 'calendario' },
];
