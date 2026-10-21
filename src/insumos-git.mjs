import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// shell: false de proposito. A url e o ramo vem de um ficheiro de configuracao e passar isso
// por uma shell em Windows partia-se com qualquer caracter especial no caminho da cache.
function correrGit(args, { cwd } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { codigo: r.status ?? -1, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function exigir(correr, args, opcoes, oQueFazia) {
  const { codigo, saida } = correr(args, opcoes);
  if (codigo !== 0) throw new Error(`${oQueFazia} falhou (codigo ${codigo}): ${saida.trim()}`);
  return saida;
}

// Clone raso e reset duro: o que interessa e o estado da ponta do ramo, nao a historia. Um
// pull daria conflitos numa cache que ninguem edita a mao.
function trazer({ nome, fonte, destino, correr, atualizar }) {
  if (!existsSync(join(destino, '.git'))) {
    if (!atualizar) {
      throw new Error(`${nome}: a cache ${destino} nao existe e atualizar esta a falso; correr 'npm run insumos'`);
    }
    exigir(correr, ['clone', '--depth', '1', '--branch', fonte.ramo, fonte.url, destino], {}, `clone de ${nome}`);
    return;
  }
  if (!atualizar) return;
  exigir(correr, ['fetch', '--depth', '1', 'origin', fonte.ramo], { cwd: destino }, `fetch de ${nome}`);
  exigir(correr, ['reset', '--hard', 'FETCH_HEAD'], { cwd: destino }, `reset de ${nome}`);
}

export function sincronizarGit(nome, fonte, { raizCache, correr = correrGit, atualizar = true } = {}) {
  mkdirSync(raizCache, { recursive: true });
  const destino = join(raizCache, nome);
  trazer({ nome, fonte, destino, correr, atualizar });
  const sha = exigir(correr, ['rev-parse', 'HEAD'], { cwd: destino }, `rev-parse de ${nome}`).trim();
  return { sha, ramo: fonte.ramo, url: fonte.url, caminho: destino };
}
