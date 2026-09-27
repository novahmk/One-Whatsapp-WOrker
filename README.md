# ONE WhatsApp Worker

Serviço Node.js + TypeScript que recebe mensagens de texto e áudio via WhatsApp
(WaSenderAPI), interpreta a intenção com a API da OpenAI e cria tarefas no
app ONE (Lovable) via API pública. Também envia códigos de verificação e
avisos diários de tarefas.

## Arquitetura

```
WaSenderAPI ──webhook──▶ POST /webhooks/whatsapp
                              │
              GET {ONE_APP_URL}/api/public/whatsapp/perfil?telefone= ── só verificados
                              │
              áudio? ─▶ Whisper (transcrição pt-BR)
                              │
              conversa pendente? ─▶ trata como resposta à pergunta
                              │
              OpenAI tool use: criar_tarefa | pedir_esclarecimento
                              │
              resolve responsável (ambíguo? pergunta de volta)
                              │
              papel gestor? ─▶ POST {ONE_APP_URL}/api/public/whatsapp/comandos/criar-tarefa
                              │
              confirmação via WaSenderAPI + agenda do responsável (notificarAgenda)

node-cron (a cada 15 min) ─▶ GET {ONE_APP_URL}/api/public/whatsapp/avisos-do-dia
                          ─▶ envia resumos com delay anti-rajada (1,5–2s)

One App ──POST /verificacao──▶ envia código de verificação via WhatsApp
```

## Rodando

```bash
cp .env.example .env   # preencha as chaves
npm install
npm run dev            # desenvolvimento (tsx watch)
npm run build && npm start
npm test               # vitest
```

### Modo de teste local (sem nenhuma API real)

```bash
MOCK_EXTERNAL=true npm run dev
```

Em outro terminal:

```bash
npm run simulate -- texto     # comando de texto → tarefa criada (Carla Lima)
npm run simulate -- audio     # áudio → download + transcrição mock → tarefa
npm run simulate -- ambiguo   # "Vitor" bate em 2 pessoas → pergunta pendente
npm run simulate -- resposta  # responde "Vitor Almeida" → resolve e cria
```

Com `MOCK_EXTERNAL=true` todas as integrações (WaSenderAPI, OpenAI, ONE) viram
stubs em memória com dados de exemplo — nenhuma chave é necessária e o segredo
do webhook vira `mock`.

## Variáveis de ambiente

Ver [.env.example](.env.example). Obrigatórias (sem `MOCK_EXTERNAL=true`):
`WASENDER_API_KEY`, `WASENDER_WEBHOOK_SECRET`, `OPENAI_API_KEY`,
`WHATSAPP_SERVICE_SECRET`. `ONE_APP_URL` é opcional (padrão
`https://onedashboard.app`); `OPENAI_MODEL` padrão `gpt-4o-mini`.

## Comportamentos importantes

- **Estado em memória**: dedupe de mensagens, conversas pendentes e controle de
  avisos enviados vivem só no processo — um restart/deploy zera esse estado
  (uma mensagem antiga reenviada pelo WaSender pode ser reprocessada e o aviso
  diário pode reenviar uma vez). Logs saem como JSON no stdout.
- **Aviso diário idempotente por processo**: 1 aviso por telefone/dia. O One App
  decide quem deve ser avisado a cada consulta; o worker apenas faz polling a
  cada 15 min.
- **Delay anti-banimento**: 1,5–2s (com jitter) entre envios no job diário.
- **Webhook sempre responde 200** (exceto assinatura inválida → 401) para o
  WaSenderAPI não reenviar o payload.
- **Autorização**: só perfis com `papel = 'gestor'` criam tarefas; outros
  recebem recusa e o evento é logado como `nao_autorizado`.
- **Telefone não reconhecido**: sem chamar a Anthropic, o remetente recebe
  orientação para pedir liberação ao gestor e o evento é logado como
  `nao_reconhecido`.
- **Agenda pós-criação**: quando o ONE confirma a tarefa (com
  `responsavel_profile_id`), o responsável recebe na hora a agenda da data do
  prazo (`notificarAgenda`), sem dedupe diário.
- **Pendências expiram em 24h** (ignoradas na busca).

## Contratos consumidos do app ONE

Todas as chamadas usam o header `Authorization: Bearer {WHATSAPP_SERVICE_SECRET}`.

`POST {ONE_APP_URL}/api/public/whatsapp/comandos/criar-tarefa`
— body `{ clinica_id, criado_por_profile_id, responsavel_nome, descricao, prazo }`
— resposta `{ sucesso: boolean, tarefa_id?: string, responsavel_profile_id?: string, erro?: string }`

`GET {ONE_APP_URL}/api/public/whatsapp/avisos-do-dia[?profile_id=...&data=YYYY-MM-DD]`
— sem filtros: todos que devem ser avisados hoje; com filtros: agenda de uma pessoa/data
— resposta: `{ dia, avisos: [{ profile_id, telefone, nome, tarefas_hoje: string[], tarefas_atrasadas: string[] }] }`

`GET {ONE_APP_URL}/api/public/whatsapp/perfil?telefone=5511999999999`
— só retorna perfil de telefone **verificado**; `perfil: null` caso contrário
— resposta: `{ perfil: { id, clinica_id, nome_completo, papel } | null, colaboradores: [{ id, nome_completo }] }`
  (`colaboradores` = todos da mesma clínica, usados para resolver o responsável)

## Contratos expostos para o app ONE

`POST /verificacao`
— header `Authorization: Bearer {WHATSAPP_SERVICE_SECRET}`
— body `{ telefone: "5511999999999", nome: "Carlos Silva", codigo: "123456" }`
— envia o código por WhatsApp e responde `{ sucesso: true }`;
  401 sem/segredo errado, 400 body inválido, 500 `{ erro }` se o envio falhar

## Checklist antes de sair do modo mock

1. [ ] Prompts do Lovable executados no ONE (endpoints `/api/public/whatsapp/*`, incluindo `perfil`)
2. [ ] Smoke test do `criar-tarefa`, `avisos-do-dia`, `perfil` e `/verificacao` com o `WHATSAPP_SERVICE_SECRET` real
3. [ ] Formato real do payload de webhook do WaSenderAPI conferido contra `extrairMensagem` (src/routes/webhook.ts)
4. [ ] Webhook cadastrado no painel do WaSenderAPI apontando para `https://<host>/webhooks/whatsapp`
5. [ ] URL do worker (`https://<host>/verificacao`) configurada no One App
