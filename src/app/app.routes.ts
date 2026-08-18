import { Routes } from '@angular/router';
import { CalendarPageComponent } from './features/calendar/calendar-page/calendar-page.component';
import { UnauthorizedPageComponent } from './features/auth/unauthorized-page.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: CalendarPageComponent,
    canActivate: [authGuard],
  },
  {
    path: 'unauthorized',
    component: UnauthorizedPageComponent,
  },
  { path: '**', redirectTo: '' },
];
