// Simulador de webhook: POSTa fixtures no servidor local sem depender do WaSenderAPI.
// Uso: npm run simulate -- texto|audio|ambiguo|resposta
// Requer o servidor rodando (idealmente com MOCK_EXTERNAL=true).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MODOS = ['texto', 'audio', 'ambiguo', 'resposta'] as const;
type Modo = (typeof MODOS)[number];

async function main(): Promise<void> {
  const modo = process.argv[2] as Modo | undefined;
  if (!modo || !MODOS.includes(modo)) {
    console.error(`Uso: npm run simulate -- <${MODOS.join('|')}>`);
    process.exit(1);
  }

  const porta = process.env.PORT ?? '3000';
  const segredo = process.env.WASENDER_WEBHOOK_SECRET ?? 'mock';
  const payload = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', `webhook-${modo}.json`), 'utf-8'),
  );

  // A resposta a uma pendência precisa manter o id fixo só se repetida; ids únicos evitam o dedupe.
  payload.data.messages.key.id = `SIM-${modo.toUpperCase()}-${Date.now()}`;

  const r = await fetch(`http://localhost:${porta}/webhooks/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': segredo },
    body: JSON.stringify(payload),
  });

  console.log(`HTTP ${r.status}:`, await r.text());
  if (modo === 'ambiguo') {
    console.log('\nAgora rode "npm run simulate -- resposta" para responder à pergunta pendente.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
