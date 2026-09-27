import OpenAI, { toFile } from 'openai';
import { Config } from '../config';
import { Deps } from '../types';

const EXTENSOES: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
};

// WhatsApp manda mimetype com codec (ex: "audio/ogg; codecs=opus").
function mimetypeBase(mimetype?: string): string {
  return (mimetype ?? '').split(';')[0].trim().toLowerCase();
}

export function extensaoAudio(mimetype?: string): string {
  return EXTENSOES[mimetypeBase(mimetype)] ?? 'ogg';
}

export function criarTranscritor(cfg: Config): Deps['transcrever'] {
  const client = new OpenAI({ apiKey: cfg.OPENAI_API_KEY });

  return async (audio: Buffer, mimetype?: string): Promise<string> => {
    const ext = extensaoAudio(mimetype);
    const inicio = Date.now();

    const resultado = await client.audio.transcriptions.create({
      file: await toFile(audio, `audio.${ext}`, {
        type: mimetypeBase(mimetype) || 'audio/ogg',
      }),
      model: 'whisper-1',
      language: 'pt',
      response_format: 'verbose_json',
      temperature: 0.2,
    });

    console.log(`Áudio transcrito em ${Date.now() - inicio}ms (${audio.length} bytes, .${ext})`);
    return String(resultado.text ?? '').trim();
  };
}
