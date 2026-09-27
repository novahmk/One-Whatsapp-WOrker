# ONE WhatsApp Worker

Serviço Node.js + TypeScript que recebe mensagens de texto e áudio via WhatsApp
(WaSenderAPI), interpreta a intenção com a API da Anthropic e cria tarefas no
app ONE (Lovable + Supabase). Também envia avisos diários de tarefas atrasadas.

## Arquitetura

```
WaSenderAPI ──webhook──▶ POST /webhooks/whatsapp
                              │
                              ▼
              profiles (Supabase, service role) ── só telefones verificados
                              │
              áudio? ─▶ Whisper (transcrição pt-BR)
                              │
              conversa pendente? ─▶ trata como resposta à pergunta
                              │
              Anthropic tool use: criar_tarefa | pedir_esclarecimento
                              │
              resolve responsável (ambíguo? pergunta de volta)
                              │
              papel gestor? ─▶ POST {ONE_APP_URL}/api/public/whatsapp/comandos/criar-tarefa
                              │
              confirmação via WaSenderAPI + log em whatsapp_mensagens_log

node-cron (a cada 15 min) ─▶ clínicas na janela de horário
                          ─▶ GET {ONE_APP_URL}/api/public/whatsapp/avisos-do-dia
                          ─▶ envia resumos com delay anti-rajada (1,5–2s)
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

Com `MOCK_EXTERNAL=true` todas as integrações (WaSenderAPI, Whisper, Anthropic,
Supabase, ONE) viram stubs em memória com dados de exemplo — nenhuma chave é
necessária e o segredo do webhook vira `mock`.

## Variáveis de ambiente

Ver [.env.example](.env.example). Sem `MOCK_EXTERNAL=true`, todas as chaves são
obrigatórias e o processo falha no boot se faltar alguma.

## Comportamentos importantes

- **Dedupe persistido**: o `message_id` do webhook é checado contra
  `whatsapp_mensagens_log` antes de processar — reinícios/deploys não causam
  reprocessamento nem respostas duplicadas.
- **Aviso diário idempotente**: antes de enviar, consulta o log
  (`tipo = 'aviso_diario'`, mesma clínica/telefone/dia). Deploy no meio do dia
  não reenvia avisos.
- **Delay anti-banimento**: 1,5–2s (com jitter) entre envios no job diário.
- **Webhook sempre responde 200** (exceto assinatura inválida → 401) para o
  WaSenderAPI não reenviar o payload.
- **Autorização**: só perfis com `papel = 'gestor'` criam tarefas; outros
  recebem recusa e o evento é logado como `nao_autorizado`.
- **Pendências expiram em 24h** (ignoradas na busca).

## Schema esperado no Supabase (já criado pelo app ONE)

O worker **não** roda migrations; ele assume estas tabelas/colunas:

```sql
profiles (
  id uuid pk,
  clinica_id uuid,
  nome_completo text,
  telefone_whatsapp text,
  whatsapp_verificado boolean,
  papel text                        -- 'gestor' | 'colaborador' | ...
)

whatsapp_conversas (
  id uuid pk default gen_random_uuid(),
  telefone text,
  clinica_id uuid,
  profile_id uuid,
  pergunta text,
  contexto jsonb,                   -- { descricao, prazo, candidatos: [{id, nome_completo}] }
  status text,                      -- 'aguardando_resposta' | 'resolvida'
  created_at timestamptz default now()
)

whatsapp_mensagens_log (
  id uuid pk default gen_random_uuid(),
  message_id text,
  telefone text,
  profile_id uuid,
  clinica_id uuid,
  tipo text,                        -- 'texto' | 'audio' | 'aviso_diario'
  texto_original text,
  transcricao text,
  interpretacao jsonb,
  resultado text,                   -- 'tarefa_criada' | 'nao_autorizado' | ...
  tarefa_id text,
  created_at timestamptz default now()
)

clinicas (
  id uuid pk,
  nome text,
  horario_aviso_whatsapp text       -- 'HH:MM'; ausente → AVISO_HORARIO_PADRAO
)
```

## Contratos consumidos do app ONE

`POST {ONE_APP_URL}/api/public/whatsapp/comandos/criar-tarefa`
— header `x-whatsapp-service-secret: {WHATSAPP_SERVICE_SECRET}`
— body `{ clinica_id, criado_por_profile_id, responsavel_nome, descricao, prazo }`
— resposta `{ sucesso: boolean, tarefa_id?: string, erro?: string }`

`GET {ONE_APP_URL}/api/public/whatsapp/avisos-do-dia?clinica_id=...`
— mesmo header
— resposta assumida: `{ avisos: [{ telefone, nome, tarefas: [{ descricao, prazo? }] }] }`
  *(formato a confirmar com o app ONE antes de sair do mock)*

## Checklist antes de sair do modo mock

1. [ ] Prompts do Lovable executados no ONE (tabelas WhatsApp + endpoints `/api/public/whatsapp/*`)
2. [ ] Tabelas `whatsapp_conversas`, `whatsapp_mensagens_log` e colunas de `profiles`/`clinicas` conferidas no Supabase
3. [ ] Smoke test do `criar-tarefa` e do `avisos-do-dia` com o `WHATSAPP_SERVICE_SECRET` real
4. [ ] Formato real do payload de webhook do WaSenderAPI conferido contra `extrairMensagem` (src/routes/webhook.ts)
5. [ ] Webhook cadastrado no painel do WaSenderAPI apontando para `https://<host>/webhooks/whatsapp`
