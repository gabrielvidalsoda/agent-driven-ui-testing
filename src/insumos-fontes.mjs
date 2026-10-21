import { sincronizarGit } from './insumos-git.mjs';
import { sincronizarPasta } from './insumos-pasta.mjs';

// Cada tipo de fonte sabe trazer-se a si proprio e devolve sempre a mesma forma:
// { sha, ramo, url, caminho }. E isso que deixa o resto da suite ignorar de onde veio o
// requisito — e que deixa o Confluence entrar aqui um dia sem tocar em mais nada.
const TIPOS = {
  git: (nome, fonte, opcoes) => sincronizarGit(nome, fonte, opcoes),
  pasta: (nome, fonte) => sincronizarPasta(nome, fonte),
};

export function sincronizar(config, { raizCache, correr } = {}) {
  const versoes = new Map();
  for (const [nome, fonte] of config.fontes) {
    const trazer = TIPOS[fonte.tipo];
    if (!trazer) {
      throw new Error(`fonte ${nome}: tipo ${fonte.tipo} ainda nao suportado (so ${Object.keys(TIPOS).join(', ')})`);
    }
    versoes.set(nome, trazer(nome, fonte, {
      raizCache, atualizar: config.atualizar, ...(correr ? { correr } : {}),
    }));
  }
  return versoes;
}
