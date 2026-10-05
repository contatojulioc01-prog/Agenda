import { Routes } from '@angular/router';
import { CalendarPageComponent } from './features/calendar/calendar-page/calendar-page.component';
import { UnauthorizedPageComponent } from './features/auth/unauthorized-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
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
