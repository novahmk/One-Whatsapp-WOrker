import 'dotenv/config';
import { carregarConfig } from './config';
import { criarDeps } from './services/deps';
import { criarServidor } from './server';
import { iniciarJobAvisos } from './jobs/avisosDiarios';

async function main(): Promise<void> {
  const cfg = carregarConfig();
  const deps = criarDeps(cfg);
  const app = criarServidor(deps, cfg);

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
  iniciarJobAvisos(deps, cfg);
  app.log.info(`ONE WhatsApp Worker no ar (mock=${cfg.MOCK_EXTERNAL})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
