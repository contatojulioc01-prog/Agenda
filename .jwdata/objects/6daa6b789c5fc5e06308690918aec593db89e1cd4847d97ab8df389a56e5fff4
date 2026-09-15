// Only authenticated sockets may receive change notifications.
async function authenticateSocket(ws, req, validateToken) {
  let token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    try { token = new URL(req.url, 'http://localhost').searchParams.get('token') || ''; } catch { }
  }
  try {
    const uid = token ? await validateToken(token) : '';
    if (!uid) { ws.close(4003, 'Sessão inválida ou expirada'); return false; }
    if (ws.readyState !== 1) return false;
    ws.userId = uid;
    return true;
  } catch {
    ws.close(1011, 'Serviço de autenticação indisponível');
    return false;
  }
}

module.exports = { authenticateSocket };
