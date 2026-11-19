---
name: admin-sync
description: >-
  Avaliação obrigatória de impacto no Painel Administrativo (/admin — exclusivo para role DEV)
  sempre que uma nova feature, módulo, tabela de banco de dados, integração externa, fluxo de
  anexos/lixeira ou recurso compartilhável for adicionado ou atualizado na aplicação DC--Agenda.
  Garante que o /admin permaneça sincronizado e funcional, atualizando-o apenas quando necessário.
---

# Sincronização Contínua do Painel Admin (`/admin`)

Sempre que você adicionar uma **nova feature**, **novo módulo** ou **update relevante** na aplicação **DC--Agenda**, execute esta avaliação antes de encerrar a tarefa e **atualize o `/admin` SE NECESSÁRIO**.

## 1. Matriz de Decisão — Quando Atualizar o `/admin`

Verifique cada item abaixo. Se a alteração se encaixar em um ou mais critérios, implemente o ajuste correspondente em `backend/routes/admin.js` e `frontend/src/app/features/admin/admin-page/`:

1. **Nova tabela no PostgreSQL (`backend/db.js`):**
   * Incluir a contagem da nova tabela em `GET /api/admin/storage/summary` (`tableQueries`).
   * Se a tabela armazenar dados pessoais/sensíveis relevantes à LGPD, incluir o indicador em `GET /api/admin/reports/lgpd`.

2. **Nova integração externa, API ou serviço interno:**
   * Adicionar verificação de disponibilidade/latência em `GET /api/admin/integrations/health` para exibição automática na aba **Saúde & Realtime**.

3. **Novo recurso com proprietário (`owner_id`), equipe, membros ou convites:**
   * Incluir o recurso no diagnóstico de permissões por colaborador (`GET /api/admin/users/:userId/diagnostics`).
   * Adicionar o novo `resourceType` em `POST /api/admin/ownership/transfer` (dentro de `db.transaction`) e no `<select>` da aba **Suporte**.
   * Se houver tabela de convites pendentes, incluir em `GET /api/admin/invitations/pending` e `DELETE /api/admin/invitations/:type/:id`.

4. **Novo tipo de anexo (`attachments.owner_type`) ou fluxo de lixeira (`deleted_at`):**
   * Atualizar a query de detecção e limpeza de anexos órfãos em `GET /api/admin/storage/summary` e `POST /api/admin/storage/cleanup-orphans` para considerar o novo `owner_type`.
   * Se houver novo fluxo de soft-delete/lixeira com necessidade de suporte operacional, avaliar exposição na aba **Armazenamento & Lixeira**.

5. **Nova configuração global ou comando operacional:**
   * Persistir em `system_settings` (ou tabela dedicada), expor sob `/api/admin/*` e propagar via `broadcast()` se afetar clientes online.

## 2. Quando NÃO Alterar o `/admin`

Para evitar complexidade desnecessária, **não** modifique o `/admin` quando a tarefa for:
* Ajuste puramente visual, CSS, layout ou textos de interface;
* Refatoração interna sem novas tabelas, integrações ou recursos gerenciáveis;
* Correção de bug pontual sem impacto em observabilidade, permissões, armazenamento ou suporte operacional.

## 3. Regras Obrigatórias ao Estender o `/admin`

* **Segurança dupla (Role `DEV`):** Toda nova rota em `backend/routes/admin.js` já herda `authenticateAgendaRequest` + `requireDevRole`; nunca exponha endpoints administrativos fora desse escopo. No frontend, qualquer novo atalho/botão para o Admin deve continuar condicionado a `authService.isDev()`.
* **Auditoria obrigatória:** Toda operação de escrita, limpeza, revogação ou transferência no `/admin` deve chamar `recordAudit(req, 'NOME_DA_ACAO', ...)`.
* **SQL Seguro e Transações:** Usar exclusivamente placeholders parametrizados (`$1, $2...`) e `db.transaction()` para operações compostas.
* **Data Local e UTF-8:** Usar `formatLocalTimestamp()` (sem UTC `Z`) e manter todos os arquivos em UTF-8.
* **UX Padronizada:** Botões HTTP com estado de loading/spinner (`busyAction` + `finalize()`) e ações destrutivas/sensíveis sempre protegidas pelo modal de confirmação (`openConfirm(...)`), nunca `window.alert()` ou `window.confirm()`.
