import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MOCK_EXTERNAL: z.enum(['true', 'false']).default('false'),
  WASENDER_API_KEY: z.string().optional(),
  WASENDER_WEBHOOK_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  ONE_APP_URL: z.string().default('https://onedashboard.app'),
  WHATSAPP_SERVICE_SECRET: z.string().optional(),
  TZ_AVISOS: z.string().default('America/Sao_Paulo'),
});

const OBRIGATORIAS = [
  'WASENDER_API_KEY',
  'WASENDER_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'WHATSAPP_SERVICE_SECRET',
] as const;

export interface Config {
  PORT: number;
  MOCK_EXTERNAL: boolean;
  WASENDER_API_KEY: string;
  WASENDER_WEBHOOK_SECRET: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  ONE_APP_URL: string;
  WHATSAPP_SERVICE_SECRET: string;
  TZ_AVISOS: string;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const p = schema.parse(env);
  const mock = p.MOCK_EXTERNAL === 'true';

  if (!mock) {
    const faltando = OBRIGATORIAS.filter((k) => !p[k]);
    if (faltando.length > 0) {
      throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${faltando.join(', ')}`);
    }
  }

  return {
    PORT: p.PORT,
    MOCK_EXTERNAL: mock,
    WASENDER_API_KEY: p.WASENDER_API_KEY ?? 'mock',
    WASENDER_WEBHOOK_SECRET: p.WASENDER_WEBHOOK_SECRET ?? 'mock',
    OPENAI_API_KEY: p.OPENAI_API_KEY ?? 'mock',
    OPENAI_MODEL: p.OPENAI_MODEL,
    ONE_APP_URL: p.ONE_APP_URL,
    WHATSAPP_SERVICE_SECRET: p.WHATSAPP_SERVICE_SECRET ?? 'mock',
    TZ_AVISOS: p.TZ_AVISOS,
  };
}
