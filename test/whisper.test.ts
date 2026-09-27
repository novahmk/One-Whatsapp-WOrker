import { describe, expect, it } from 'vitest';
import { extensaoAudio } from '../src/services/whisper';

describe('extensaoAudio', () => {
  it('mapeia mimetypes de WhatsApp com codec', () => {
    expect(extensaoAudio('audio/ogg; codecs=opus')).toBe('ogg');
    expect(extensaoAudio('audio/mp4')).toBe('m4a');
    expect(extensaoAudio('audio/mpeg')).toBe('mp3');
    expect(extensaoAudio('AUDIO/WAV')).toBe('wav');
  });

  it('usa ogg como padrão para mimetype ausente ou desconhecido', () => {
    expect(extensaoAudio(undefined)).toBe('ogg');
    expect(extensaoAudio('video/mp4')).toBe('ogg');
  });
});
