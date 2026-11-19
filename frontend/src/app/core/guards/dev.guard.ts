import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const devGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isDev()) {
    return true;
  }

  return authService.ensureUserLoaded().pipe(
    map(() => (authService.isDev() ? true : router.createUrlTree(['/calendario'])))
  );
};
