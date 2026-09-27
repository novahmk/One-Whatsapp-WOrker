import Fastify, { FastifyInstance } from 'fastify';
import { Config } from './config';
import { Deps } from './types';
import { registrarHealth } from './routes/health';
import { registrarWebhook } from './routes/webhook';

export function criarServidor(deps: Deps, cfg: Config): FastifyInstance {
  const app = Fastify({ logger: true });
  registrarHealth(app);
  registrarWebhook(app, deps, cfg);
  return app;
}
