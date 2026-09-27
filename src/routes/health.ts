import { FastifyInstance } from 'fastify';

export function registrarHealth(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' }));
}
