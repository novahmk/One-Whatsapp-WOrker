import { Config } from '../config';
import { Deps } from '../types';
import { criarDb } from './supabase';
import { criarWasender } from './wasender';
import { criarTranscritor } from './whisper';
import { criarInterpretador } from './anthropic';
import { criarOneApp } from './oneApp';
import { criarDepsMock } from './mock';

export function criarDeps(cfg: Config): Deps {
  if (cfg.MOCK_EXTERNAL) {
    console.log('MOCK_EXTERNAL=true — todas as integrações externas estão simuladas.');
    return criarDepsMock().deps;
  }

  return {
    db: criarDb(cfg),
    whats: criarWasender(cfg),
    transcrever: criarTranscritor(cfg),
    interpretar: criarInterpretador(cfg),
    one: criarOneApp(cfg),
  };
}
