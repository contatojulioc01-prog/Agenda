import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Verifica se o ticket ou token veio como query param nesta navegação
  const queryToken = route.queryParamMap.get('ticket') || route.queryParamMap.get('token');
  if (queryToken && queryToken.trim().length > 0) {
    if (!authService.setToken(queryToken.trim())) {
      return router.createUrlTree(['/unauthorized']);
    }

    // O AuthService já retirou o token da barra de endereço. Retornamos também
    // uma UrlTree limpa para que o Router não mantenha o segredo no estado da
    // navegação nem o recoloque na URL ao avançar/voltar.
    const cleanUrl = router.parseUrl(state.url);
    delete cleanUrl.queryParams['ticket'];
    delete cleanUrl.queryParams['token'];
    return cleanUrl;
  }

  // Verifica se já temos um token armazenado
  if (authService.getToken()) {
    return true;
  }

  // Se não houver token, redireciona para a página informativa de autenticação
  return router.createUrlTree(['/unauthorized']);
};
