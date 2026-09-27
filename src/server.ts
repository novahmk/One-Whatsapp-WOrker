import Fastify, { FastifyInstance } from 'fastify';
import { Config } from './config';
import { Deps } from './types';
import { registrarHealth } from './routes/health';
import { registrarWebhook } from './routes/webhook';
import { registrarVerificacao } from './routes/verificacao';
import { registrarNotificar } from './routes/notificar';

export function criarServidor(deps: Deps, cfg: Config): FastifyInstance {
  const app = Fastify({ logger: true });
  registrarHealth(app);
  registrarWebhook(app, deps, cfg);
  registrarVerificacao(app, deps, cfg);
  registrarNotificar(app, deps, cfg);
  return app;
}
