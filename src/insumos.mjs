import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

export const CACHE_OMISSAO = '.insumos';
export const RAMO_OMISSAO = 'main';

const VAZIA = () => ({
  cache: CACHE_OMISSAO,
  atualizar: true,
  fontes: new Map(),
  comuns: [],
  porDocumento: new Map(),
});

// O ficheiro pode nao existir: a suite corria sem insumos antes de eles existirem e tem de
// continuar a correr. Uma fonte mal declarada, essa, e erro — descobre-se ao carregar e nao
// a meio de uma corrida ja paga.
export function carregarInsumos(caminhoYaml) {
  if (!existsSync(caminhoYaml)) return VAZIA();
  const cru = parse(readFileSync(caminhoYaml, 'utf8')) ?? {};
  const config = VAZIA();
  config.cache = cru.cache ?? CACHE_OMISSAO;
  config.atualizar = cru.atualizar ?? true;

  for (const [nome, valor] of Object.entries(cru.fontes ?? {})) {
    if (!valor?.url) throw new Error(`fonte ${nome}: falta a url em insumos.yaml`);
    config.fontes.set(nome, {
      tipo: valor.tipo ?? 'git',
      url: valor.url,
      ramo: valor.ramo ?? RAMO_OMISSAO,
    });
  }
  config.comuns = cru.comuns ?? [];
  for (const [documento, refs] of Object.entries(cru.por_documento ?? {})) {
    config.porDocumento.set(documento, refs ?? []);
  }
  return config;
}

export function partirRef(ref) {
  const i = String(ref).indexOf(':');
  if (i <= 0) throw new Error(`referencia de insumo invalida: ${ref} (esperado fonte:caminho)`);
  return { fonte: ref.slice(0, i), caminho: ref.slice(i + 1) };
}

// Os comuns vao a frente porque sao o enquadramento (padroes, contratos) e o insumo proprio
// da tela e a especificidade que os fecha.
export function refsDe(config, documento) {
  return [...new Set([...config.comuns, ...(config.porDocumento.get(documento) ?? [])])];
}

// Onde vive a fonte depois de sincronizada. Uma fonte git foi clonada para dentro da cache;
// uma fonte em pasta ja estava no disco e nao se copia — copia-la so criaria uma segunda
// verdade para alguem editar por engano.
export function raizDaFonte(fonte, nome, raizCache) {
  return fonte.tipo === 'pasta' ? resolve(fonte.url) : join(raizCache, nome);
}

export function caminhoDeRef(config, ref, raizCache) {
  const { fonte, caminho } = partirRef(ref);
  if (!config.fontes.has(fonte)) {
    throw new Error(`${ref}: a fonte ${fonte} nao esta declarada em insumos.yaml`);
  }
  return join(raizDaFonte(config.fontes.get(fonte), fonte, raizCache), caminho);
}

export function lerInsumos(config, documento, { raizCache, ler = readFileSync } = {}) {
  return refsDe(config, documento).map((ref) => {
    const caminho = caminhoDeRef(config, ref, raizCache);
    if (!existsSync(caminho)) {
      throw new Error(`insumo em falta: ${ref} (esperado em ${caminho}); sincronizar as fontes`);
    }
    return { ref, fonte: partirRef(ref).fonte, caminho, texto: ler(caminho, 'utf8') };
  });
}
