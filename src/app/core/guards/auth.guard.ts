import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verifica se o token veio como query param nesta navegação
  const queryToken = route.queryParamMap.get('token');
  if (queryToken && queryToken.trim().length > 0) {
    return authService.setToken(queryToken.trim())
      ? true
      : router.createUrlTree(['/unauthorized']);
  }

  // Verifica se já temos um token armazenado
  if (authService.getToken()) {
    return true;
  }

  // Se não houver token, redireciona para a página informativa de autenticação
  return router.createUrlTree(['/unauthorized']);
};
