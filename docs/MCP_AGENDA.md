# MCP da Agenda Corporativa

O projeto expõe um servidor MCP real em `POST /api/mcp`, no mesmo processo do backend. O transporte é **Streamable HTTP**, com compatibilidade stateless para clientes MCP de 2025 e suporte ao protocolo atual do SDK instalado.

## Endereços

- Desenvolvimento: `http://127.0.0.1:9900/api/mcp`
- Produção atrás do prefixo atual: `http://docebrinquedo.local/agenda/api/mcp`
- Produção quando o proxy já remove `/agenda`: `http://docebrinquedo.local/api/mcp`

O endpoint exige `Authorization: Bearer <token-da-sessão>`. A chave `SSO_LLM_API_KEY` é usada exclusivamente pelo backend para conversar com o gateway de IA e nunca deve ser enviada por um cliente MCP.

No ambiente iniciado por `npm run dev`, use o token local `agenda-dev-local`. Esse bypass funciona somente em `127.0.0.1` e em modo de desenvolvimento.

Exemplo genérico de configuração de cliente:

```json
{
  "mcpServers": {
    "doce-agenda": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:9900/api/mcp",
      "headers": {
        "Authorization": "Bearer agenda-dev-local"
      }
    }
  }
}
```

## Capacidades

O servidor publica 50 ferramentas que cobrem o domínio funcional da aplicação, três recursos de conhecimento e o prompt `planejar_dia`:

- `agenda://manual`: entidades, relacionamentos, permissões, formatos e regras de segurança;
- `agenda://schema`: catálogo JSON completo das ferramentas, parâmetros e indicação de leitura/exclusão;
- `agenda://contexto`: estrutura acessível, permissões, convites, preferências, dispositivos sem segredos e totais do usuário autenticado.

Ferramentas disponíveis:

- Contexto: `obter_contexto`, `obter_contexto_completo`.
- Agendas: `listar_agendas`, `obter_agenda`, `criar_agenda`, `atualizar_agenda`, `excluir_agenda`.
- Eventos: `listar_eventos`, `obter_evento`, `criar_evento`, `atualizar_evento`, `excluir_evento`.
- Membros e convites de agenda: `listar_membros_agenda`, `listar_convites_agenda`, `convidar_membro_agenda`, `responder_convite_agenda`, `alterar_membro_agenda`, `remover_membro_agenda`.
- Equipes: `listar_equipes`, `obter_equipe`, `criar_equipe`, `atualizar_equipe`, `excluir_equipe`.
- Membros e convites de equipe: `listar_membros_equipe`, `listar_convites_equipe`, `convidar_membro_equipe`, `responder_convite_equipe`, `remover_membro_equipe`.
- Quadros e colunas: `listar_quadros`, `obter_quadro`, `criar_quadro`, `atualizar_quadro`, `excluir_quadro`, `listar_colunas`, `criar_coluna`, `atualizar_coluna`, `excluir_coluna`.
- Tarefas: `listar_tarefas`, `obter_tarefa`, `criar_tarefa`, `atualizar_tarefa`, `mover_tarefa_para_lixeira`, `listar_lixeira_tarefas`, `restaurar_tarefa`, `excluir_tarefa_permanentemente`.
- Anexos: `listar_anexos`, `excluir_anexo`.
- Notificações: `obter_configuracao_notificacoes`, `atualizar_preferencias_notificacoes`.
- Privacidade: `exportar_meus_dados`.

As descrições aceitam Markdown. Tarefas aceitam subtarefas, responsáveis, etiquetas e checklist. Eventos de prazo gerados pelo Kanban só podem ser alterados pela tarefa de origem. Exclusões exigem literalmente `confirmar: true` e todas as operações validam a permissão do usuário autenticado.

O conteúdo binário de anexos não é injetado automaticamente no contexto: o MCP fornece seus metadados. Chaves de dispositivos, hashes, token SSO e a chave do gateway de IA nunca são publicados.

O banco local guarda referências de usuário por ID; nome, e-mail e avatar pertencem ao diretório corporativo SSO e são resolvidos pela interface. O MCP não inventa nem mantém uma cópia desses dados externos. Cadastro de dispositivo (que gera chave secreta), transferência de binários e anonimização ampla da conta permanecem nos fluxos explícitos da API/interface e não são automatizados pela IA.

## Configuração

As opções ficam no `.env` do projeto ou do backend:

```dotenv
MCP_ALLOWED_HOSTS=docebrinquedo.local,127.0.0.1,localhost
AGENDA_TIME_ZONE=America/Sao_Paulo
```

Quando `MCP_ALLOWED_HOSTS` não é definido, o servidor aceita localhost, endereços de rede privada e domínios `.local`. Em uma publicação com outro domínio, inclua-o explicitamente.

## Relação com o assistente interno

O gateway Doce LLM atualmente rejeita os campos OpenAI `tools` e `tool_choice`. Por isso, o chat interno usa uma etapa de planejamento JSON e executa exatamente as mesmas funções do MCP. O catálogo enviado ao planejador é selecionado por assunto (agenda, equipe/Kanban, anexos, notificações ou privacidade), mantendo todas as capacidades disponíveis sem desperdiçar contexto. Consultas e alterações feitas pelo assistente obedecem às mesmas permissões do endpoint MCP.

## Verificação rápida

1. Execute `npm run dev` na raiz.
2. Conecte um cliente MCP ao endereço de desenvolvimento usando o token local acima.
3. Liste as ferramentas e confirme que há 50 operações.
4. Leia `agenda://schema` e chame `obter_contexto_completo`.
5. Confirme que a resposta contém apenas entidades e configurações do usuário de desenvolvimento.

Para produção, substitua o token local por um token de sessão SSO válido.
