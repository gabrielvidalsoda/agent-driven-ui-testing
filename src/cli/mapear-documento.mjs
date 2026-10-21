import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { carregarAlvos, alvoDe, urlDe, corrivel } from '../alvos.mjs';
import { carregarCredenciais, autenticacaoPara } from '../credenciais.mjs';
import { montarEnunciadoMapa } from '../enunciado-mapa.mjs';
import { montarEnunciadoRepescagem } from '../enunciado-repescagem.mjs';
import { escreverConfigMcp } from '../mcp.mjs';
import { executarDocumento } from '../executar-documento.mjs';
import {
  validarMapa, validarRepescagem, escreverMapa, caminhoMapa, existeMapa,
  alvosDeRepescagem, fundirRepescagem, lerMapa,
} from '../mapa.mjs';

export function prepararMapeamento({ documento, config, raizCenarios, pastaCorridas, perfil = {}, credencial = null }) {
  const alvo = alvoDe(config.alvos, documento);
  const texto = readFileSync(join(raizCenarios, documento), 'utf8');
  // Pasta propria: o mapeamento e a corrida de testes do mesmo documento nao se pisam, e as
  // capturas de um nao se confundem com as do outro.
  const pastaTrabalho = resolve(
    pastaCorridas,
    `${documento.replaceAll('/', '__').replace(/\.md$/, '')}__mapa`,
  );
  mkdirSync(pastaTrabalho, { recursive: true });

  const caminhoMcp = escreverConfigMcp(pastaTrabalho, {
    pastaSaida: pastaTrabalho,
    imagens: config.imagens,
    perfil,
    visivel: Boolean(config.visivel),
  });

  const enunciado = montarEnunciadoMapa({
    documento,
    texto,
    url: urlDe(config.base_url, alvo),
    pastaEvidencias: pastaTrabalho,
    versoes: config.versoes ?? {},
    produto: config.produto ?? 'aplicação',
    navegacao: alvo.navegacao,
    autenticacao: autenticacaoPara(config.credenciais ?? carregarCredenciais(''), credencial),
  });

  const bare = config.bare ?? Boolean(process.env.ANTHROPIC_API_KEY);
  return { enunciado, caminhoMcp, pastaTrabalho, bare, modelo: config.modelo, timeoutMs: config.timeout_ms };
}

// As outras telas da mesma seccao de menu. A repescagem visita-as porque a accao que falta
// vive, muitas vezes, no ecra do lado — e nao no que o documento descreve.
export function telasIrmas({ documento, config }) {
  const alvo = alvoDe(config.alvos, documento);
  return [...config.alvos.entries()]
    .filter(([outro, v]) => outro !== documento && v.sessao === alvo.sessao)
    .filter(([, v]) => corrivel(v))
    .map(([outro, v]) => ({ documento: outro, url: urlDe(config.base_url, v) }));
}

export function prepararRepescagem({ documento, config, raizCenarios, pastaCorridas, perfil = {}, alvos, credencial = null }) {
  const alvo = alvoDe(config.alvos, documento);
  const texto = readFileSync(join(raizCenarios, documento), 'utf8');
  const pastaTrabalho = resolve(
    pastaCorridas,
    `${documento.replaceAll('/', '__').replace(/\.md$/, '')}__repescagem`,
  );
  mkdirSync(pastaTrabalho, { recursive: true });

  const caminhoMcp = escreverConfigMcp(pastaTrabalho, {
    pastaSaida: pastaTrabalho,
    imagens: config.imagens,
    perfil,
    visivel: Boolean(config.visivel),
  });

  const enunciado = montarEnunciadoRepescagem({
    documento,
    texto,
    url: urlDe(config.base_url, alvo),
    pastaEvidencias: pastaTrabalho,
    alvos,
    irmas: telasIrmas({ documento, config }),
    produto: config.produto ?? 'aplicação',
    autenticacao: autenticacaoPara(config.credenciais ?? carregarCredenciais(''), credencial),
  });

  const bare = config.bare ?? Boolean(process.env.ANTHROPIC_API_KEY);
  return { enunciado, caminhoMcp, pastaTrabalho, bare, modelo: config.modelo, timeoutMs: config.timeout_ms };
}

export function documentosPorMapear(alvos, sessaoId, pastaMapas, { remapear = false } = {}) {
  return [...alvos.entries()]
    .filter(([, alvo]) => alvo.sessao === sessaoId)
    .filter(([, alvo]) => corrivel(alvo))
    .map(([documento]) => documento)
    .filter((documento) => remapear || !existeMapa(caminhoMapa(pastaMapas, documento)));
}

// Nem o mapa nem a repescagem passam pelo normalizar: nao tem veredictos nem niveis, so
// descricao.
const SEM_NORMALIZAR = (objeto) => ({ resposta: objeto, avisos: [] });

export async function mapearDocumento({ documento, preparado, pastaMapas, repescar }, deps = {}) {
  // Decisao explicita, sempre. Um `repescar` esquecido saltava a segunda passagem em silencio,
  // e numa sessao inteira isso so se via depois de paga. Quem nao quer repescar passa `null`.
  if (repescar === undefined) {
    throw new Error('mapearDocumento: falta decidir `repescar` (uma funcao, ou null para saltar a segunda passagem)');
  }
  const resultado = await executarDocumento(
    { documento, ...preparado },
    { ...deps, validar: validarMapa, normalizar: SEM_NORMALIZAR },
  );
  if (resultado.estado !== 'concluido') return resultado;

  // Segunda passagem, por omissao: volta ao que a primeira nao encontrou e procura-o com outro
  // nome, ou noutra tela da mesma seccao. Sem alvos nao corre e nao custa nada.
  let mapa = resultado.resposta;
  let repescagem = null;
  const alvos = alvosDeRepescagem(mapa);
  if (repescar && alvos.length > 0) {
    repescagem = await executarDocumento(
      { documento, ...repescar(alvos) },
      { ...deps, validar: validarRepescagem, normalizar: SEM_NORMALIZAR },
    );
    if (repescagem.estado === 'concluido') mapa = fundirRepescagem(mapa, repescagem.resposta);
  }

  const caminho = escreverMapa(caminhoMapa(pastaMapas, documento), mapa);
  const avisos = [
    ...resultado.avisos,
    ...(repescagem && repescagem.estado !== 'concluido'
      ? [`repescagem falhou (${repescagem.estado}); o mapa ficou com o da primeira passagem`]
      : []),
    ...(repescagem?.avisos ?? []),
  ];
  return {
    ...resultado,
    resposta: mapa,
    caminho,
    avisos,
    alvosRepescados: alvos.length,
    metricas: somarMetricas(resultado.metricas, repescagem?.metricas),
  };
}

// As duas passagens sao dois agentes e dois custos; o que interessa a quem le o resumo e o
// custo do documento.
function somarMetricas(primeira, segunda) {
  if (!segunda) return primeira;
  return {
    ...primeira,
    duracaoMs: (primeira?.duracaoMs ?? 0) + (segunda.duracaoMs ?? 0),
    custoUsd: (primeira?.custoUsd ?? 0) + (segunda.custoUsd ?? 0),
    tokensSaida: (primeira?.tokensSaida ?? 0) + (segunda.tokensSaida ?? 0),
  };
}

// Repescar sozinho um mapa que ja existe. Serve para voltar a caçar depois de melhorar o
// enunciado da segunda passagem, sem pagar a primeira outra vez.
export async function repescarDocumento({ documento, pastaMapas, repescar }, deps = {}) {
  const mapa = lerMapa(caminhoMapa(pastaMapas, documento));
  const alvos = alvosDeRepescagem(mapa);
  if (alvos.length === 0) {
    return { estado: 'concluido', resposta: mapa, avisos: ['nada por repescar'], alvosRepescados: 0, metricas: null };
  }
  const repescagem = await executarDocumento(
    { documento, ...repescar(alvos) },
    { ...deps, validar: validarRepescagem, normalizar: SEM_NORMALIZAR },
  );
  if (repescagem.estado !== 'concluido') {
    return { ...repescagem, resposta: mapa, alvosRepescados: alvos.length };
  }
  const fundido = fundirRepescagem(mapa, repescagem.resposta);
  return {
    ...repescagem,
    resposta: fundido,
    caminho: escreverMapa(caminhoMapa(pastaMapas, documento), fundido),
    alvosRepescados: alvos.length,
  };
}

function carregarConfig(caminho) {
  const cru = parse(readFileSync(caminho, 'utf8'));
  return { ...cru, alvos: carregarAlvos(join(dirname(caminho), 'alvos.yaml')) };
}

function opcaoDe(resto) {
  return (nome, omissao) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : omissao;
  };
}

async function principal() {
  const [documento, ...resto] = process.argv.slice(2);
  if (!documento) {
    console.error('uso: npm run mapear -- <documento.md> [--config config/corrida.yaml] [--remapear] [--so-repescagem] [--sem-repescagem]');
    process.exit(2);
  }
  const opcao = opcaoDe(resto);
  const config = carregarConfig(opcao('--config', 'config/corrida.yaml'));
  const pastaMapas = config.pasta_mapas ?? './mapas';

  const soRepescagem = resto.includes('--so-repescagem');
  if (!soRepescagem && !resto.includes('--remapear') && existeMapa(caminhoMapa(pastaMapas, documento))) {
    console.error(`${documento} ja tem mapa em ${caminhoMapa(pastaMapas, documento)}; usar --remapear para refazer, ou --so-repescagem para so a segunda passagem`);
    process.exit(0);
  }

  const semRepescagem = resto.includes('--sem-repescagem');
  const repescar = semRepescagem ? null : (alvos) => prepararRepescagem({
    documento,
    config,
    raizCenarios: config.raiz_cenarios,
    pastaCorridas: config.pasta_corridas,
    alvos,
  });

  let resultado;
  if (soRepescagem) {
    console.error(`a repescar ${documento}, sem repetir a primeira passagem`);
    resultado = await repescarDocumento({ documento, pastaMapas, repescar });
  } else {
    const preparado = prepararMapeamento({
      documento,
      config,
      raizCenarios: config.raiz_cenarios,
      pastaCorridas: config.pasta_corridas,
    });
    console.error(`a mapear ${documento} em ${preparado.pastaTrabalho}`);
    resultado = await mapearDocumento({ documento, preparado, pastaMapas, repescar });
  }
  console.log(JSON.stringify({
    documento,
    estado: resultado.estado,
    caminho: resultado.caminho ?? null,
    accoes: resultado.resposta?.accoes?.length ?? 0,
    repescados: resultado.alvosRepescados ?? 0,
    encontrados_na_repescagem: (resultado.resposta?.repescagem?.alvos ?? [])
      .filter((a) => a.resultado === 'encontrado').map((a) => a.alvo),
    casos_sem_accao: resultado.resposta?.casos_sem_accao ?? [],
    metricas: resultado.metricas,
    avisos: resultado.avisos,
  }, null, 2));
  process.exit(resultado.estado === 'concluido' ? 0 : 1);
}

export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  await principal();
}
