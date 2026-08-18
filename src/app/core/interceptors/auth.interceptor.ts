import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;

  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token') || localStorage.getItem('agenda_token');
    } catch {
      token = null;
    }
  }

  // Anexa o token JWT se disponível
  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token.trim()}`
      }
    });
    return next(authReq);
  }

  return next(req);
};
