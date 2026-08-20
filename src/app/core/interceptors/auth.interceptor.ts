import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;
  let appBasePath = '';

  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      token = urlParams.get('token') || localStorage.getItem('agenda_token');
      appBasePath = new URL(document.baseURI).pathname.replace(/\/$/, '');
    } catch {
      token = null;
    }
  }

  // No IIS, chamadas locais como /api e /health precisam passar por /agenda.
  // URLs externas e URLs ja prefixadas permanecem intactas.
  const shouldPrefix = appBasePath.length > 0
    && req.url.startsWith('/')
    && req.url !== appBasePath
    && !req.url.startsWith(`${appBasePath}/`);
  let request = shouldPrefix ? req.clone({ url: `${appBasePath}${req.url}` }) : req;

  if (token) {
    request = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token.trim()}`,
      },
    });
  }

  return next(request);
};
