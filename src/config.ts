import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MOCK_EXTERNAL: z.enum(['true', 'false']).default('false'),
  WASENDER_API_KEY: z.string().optional(),
  WASENDER_WEBHOOK_SECRET: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  OPENAI_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ONE_APP_URL: z.string().optional(),
  WHATSAPP_SERVICE_SECRET: z.string().optional(),
  AVISO_HORARIO_PADRAO: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('08:00'),
  TZ_AVISOS: z.string().default('America/Sao_Paulo'),
});

const OBRIGATORIAS = [
  'WASENDER_API_KEY',
  'WASENDER_WEBHOOK_SECRET',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ONE_APP_URL',
  'WHATSAPP_SERVICE_SECRET',
] as const;

export interface Config {
  PORT: number;
  MOCK_EXTERNAL: boolean;
  WASENDER_API_KEY: string;
  WASENDER_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL: string;
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ONE_APP_URL: string;
  WHATSAPP_SERVICE_SECRET: string;
  AVISO_HORARIO_PADRAO: string;
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
    ANTHROPIC_API_KEY: p.ANTHROPIC_API_KEY ?? 'mock',
    ANTHROPIC_MODEL: p.ANTHROPIC_MODEL,
    OPENAI_API_KEY: p.OPENAI_API_KEY ?? 'mock',
    SUPABASE_URL: p.SUPABASE_URL ?? 'http://mock.supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: p.SUPABASE_SERVICE_ROLE_KEY ?? 'mock',
    ONE_APP_URL: p.ONE_APP_URL ?? 'http://mock.one.local',
    WHATSAPP_SERVICE_SECRET: p.WHATSAPP_SERVICE_SECRET ?? 'mock',
    AVISO_HORARIO_PADRAO: p.AVISO_HORARIO_PADRAO,
    TZ_AVISOS: p.TZ_AVISOS,
  };
}
