const { createAgendaMcpServer } = require('./agenda-tools');

async function createAgendaMcpHttpHandler(broadcast) {
  const [{ createMcpHandler }, { toNodeHandler }] = await Promise.all([
    import('@modelcontextprotocol/server'),
    import('@modelcontextprotocol/node'),
  ]);

  const handler = createMcpHandler(async context => {
    const userId = String(context.authInfo?.extra?.userId || context.authInfo?.clientId || '');
    if (!userId) throw new Error('Contexto MCP sem usuário autenticado.');
    return createAgendaMcpServer(userId, broadcast);
  }, {
    legacy: 'stateless',
    responseMode: 'auto',
    onerror: error => console.error('[MCP]', error.message),
  });

  const nodeHandler = toNodeHandler(handler, {
    onerror: error => console.error('[MCP HTTP]', error.message),
  });

  return {
    middleware: (req, res) => nodeHandler(req, res, req.body),
    close: () => handler.close(),
  };
}

module.exports = { createAgendaMcpHttpHandler };
