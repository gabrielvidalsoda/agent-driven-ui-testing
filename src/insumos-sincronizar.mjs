import { sincronizar } from './insumos-fontes.mjs';
import { CACHE_OMISSAO } from './insumos.mjs';

// Correr com um requisito de ontem e pior do que nao correr: os veredictos sairiam contra uma
// especificacao que ja mudou e ninguem os saberia distinguir. Por isso a falha e ruidosa e
// para o comando, com a saida para `atualizar: false` escrita na propria mensagem.
export function sincronizarFontes(config, { raizCache = config.insumos?.cache ?? CACHE_OMISSAO, correr } = {}) {
  const insumos = config.insumos;
  if (!insumos || insumos.fontes.size === 0) return new Map();
  let versoes;
  try {
    versoes = sincronizar(insumos, { raizCache, ...(correr ? { correr } : {}) });
  } catch (erro) {
    throw new Error(
      `nao consegui sincronizar as fontes de insumo: ${erro.message}\n` +
      `pôr 'atualizar: false' no config/insumos.yaml corre com o que ja esta em ${raizCache}`,
    );
  }
  // Um sha corta-se aos 7; a marca de uma pasta é uma data, e cortá-la dava "2026-09".
  for (const [nome, v] of versoes) {
    const versao = v.ramo === 'pasta' ? v.sha : v.sha.slice(0, 7);
    console.error(`insumos: ${nome} em ${v.ramo} ${versao}`);
  }
  return versoes;
}

// Vai para o sessao.json e para o resultado.json: e o que liga um veredicto a versao exacta
// do requisito com que foi dado.
export function versoesParaRegisto(versoes) {
  return Object.fromEntries([...versoes].map(([nome, v]) => [nome, { ramo: v.ramo, sha: v.sha, url: v.url }]));
}
