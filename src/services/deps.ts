import { Config } from '../config';
import { Deps } from '../types';
import { criarEstadoMemoria } from './memoria';
import { criarWasender } from './wasender';
import { criarTranscritor } from './whisper';
import { criarInterpretador } from './interpretador';
import { criarOneApp } from './oneApp';
import { criarDepsMock } from './mock';

export function criarDeps(cfg: Config): Deps {
  if (cfg.MOCK_EXTERNAL) {
    console.log('MOCK_EXTERNAL=true — todas as integrações externas estão simuladas.');
    return criarDepsMock().deps;
  }

  return {
    db: criarEstadoMemoria(cfg.TZ_AVISOS),
    whats: criarWasender(cfg),
    transcrever: criarTranscritor(cfg),
    interpretar: criarInterpretador(cfg),
    one: criarOneApp(cfg),
  };
}
