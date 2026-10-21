import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { alvoDe, urlDe } from '../alvos.mjs';
import { carregarConfigCorrida } from '../config.mjs';
import { sincronizarFontes } from '../insumos-sincronizar.mjs';
import { montarEnunciado } from '../enunciado.mjs';
import { escreverConfigMcp } from '../mcp.mjs';
import { executarDocumento } from '../executar-documento.mjs';
import { redigirEvidencias } from '../redigir.mjs';
import { lerMapa, caminhoMapa } from '../mapa.mjs';
import { resolverNivel } from '../nivel.mjs';
import { resolverUsarMapa } from '../usar-mapa.mjs';
import { carregarInsumos, lerInsumos, CACHE_OMISSAO } from '../insumos.mjs';
import { carregarCredenciais, autenticacaoPara } from '../credenciais.mjs';

// O marcador leva a data para se distinguirem corridas do mesmo documento em dias diferentes:
// sem ela, o que sobrou de ontem confunde-se com o de hoje na hora de limpar a mao.
function marcadorDe(documento, hoje) {
  const nome = documento.split('/').pop().replace(/\.md$/, '');
  return `AGENTE-${hoje.replaceAll('-', '')}-${nome}`;
}

export function prepararCorrida({
  documento, config, raizCenarios, pastaCorridas, perfil = {},
  pastaMapas = config.pasta_mapas ?? './mapas',
  raizInsumos = config.insumos?.cache ?? CACHE_OMISSAO,
  nivelCli,
  hoje = new Date().toISOString().slice(0, 10),
  ligacaoBd = process.env.CCMSNS_BD_LIGACAO ?? null,
  semMapa,
  credencial = null,
}) {
  const alvo = alvoDe(config.alvos, documento);
  const texto = readFileSync(join(raizCenarios, documento), 'utf8');
  // `semMapa` da linha de comando e a negacao de `usar_mapa`, que e como a configuracao o
  // escreve. Fica resolvido num sitio so, com a mesma precedencia do nivel.
  const usarMapa = resolverUsarMapa({
    cli: semMapa === undefined ? undefined : !semMapa,
    documento: alvo.usar_mapa,
    global: config.usar_mapa,
  });
  // Com mapa, o ambito do teste e o que a tela entrega, apurado antes numa passagem barata.
  // Sem ele, o ambito passa a ser o documento de cenarios mais o requisito tecnico, e quem
  // percorre a tela e o proprio agente -- mais caro por corrida, mas sem levantamento previo.
  // Um mapa que exista e ignorado de proposito: a corrida sem mapa tem de ser comparavel.
  const mapa = usarMapa ? lerMapa(caminhoMapa(pastaMapas, documento)) : null;
  const nivel = resolverNivel({ cli: nivelCli, documento: alvo.nivel, global: config.nivel });
  // Um insumo declarado que nao esteja na cache faz o documento rebentar aqui, antes de se
  // gastar nada: julgar uma tela com o requisito a faltar da veredictos que se pagam na mesma.
  const insumos = lerInsumos(config.insumos ?? carregarInsumos(''), documento, { raizCache: raizInsumos });

  // resolve, nao join: o agente e lancado com cwd nesta pasta, e um caminho relativo
  // resolver-se-ia uma segunda vez, dando uma pasta duplicada que nao existe.
  const pastaTrabalho = resolve(pastaCorridas, documento.replaceAll('/', '__').replace(/\.md$/, ''));
  mkdirSync(pastaTrabalho, { recursive: true });

  const caminhoMcp = escreverConfigMcp(pastaTrabalho, {
    pastaSaida: pastaTrabalho,
    imagens: config.imagens,
    perfil,
    visivel: Boolean(config.visivel),
  });

  const marcador = marcadorDe(documento, hoje);
  const autenticacao = autenticacaoPara(config.credenciais ?? carregarCredenciais(''), credencial);
  const enunciado = montarEnunciado({
    documento,
    texto,
    url: urlDe(config.base_url, alvo),
    pastaEvidencias: pastaTrabalho,
    marcador,
    mapa,
    nivel,
    insumos,
    produto: config.produto ?? 'aplicação',
    navegacao: alvo.navegacao,
    // A documentacao pode ser um guiao de teste ja escrito ou a descricao funcional do
    // produto. Sao trabalhos diferentes para o agente, e o enunciado diz-lho.
    tipoDocumento: alvo.tipo_documento ?? config.tipo_documentos ?? 'cenarios',
    autenticacao,
    // Sem ligacao configurada o agente nao ouve falar de base de dados: melhor que ouvir e
    // levar com um erro de ligacao no meio de um caso.
    comandoBd: ligacaoBd ? `bash ${resolve('scripts/bd.sh')}` : null,
  });

  // Por omissao, `bare` so quando ha chave de API — que e o caso da VM. Numa maquina
  // autenticada por subscricao, --bare faria o agente falhar a autenticacao.
  const bare = config.bare ?? Boolean(process.env.ANTHROPIC_API_KEY);

  return {
    enunciado, caminhoMcp, pastaTrabalho, bare, mapa, nivel, marcador,
    // As evidencias passam por aqui antes de irem para o git: o despejo de pagina do ecra de
    // entrada traz o valor do campo de senha em claro.
    segredos: autenticacao ? [autenticacao.senha] : [],
    insumosUsados: insumos.map((i) => i.ref),
    modelo: config.modelo, timeoutMs: config.timeout_ms,
    ambienteExtra: ligacaoBd ? { CCMSNS_BD_LIGACAO: ligacaoBd, CCMSNS_BD_MARCADOR: marcador } : {},
  };
}

async function principal() {
  const [documento, ...resto] = process.argv.slice(2);
  if (!documento) {
    console.error('uso: npm run correr -- <documento.md> [--config config/corrida.yaml] [--nivel 1|2|3] [--sem-mapa|--com-mapa]');
    process.exit(2);
  }
  const opcao = (nome, omissao) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : omissao;
  };
  const config = carregarConfigCorrida(opcao('--config', 'config/corrida.yaml'));
  try {
    sincronizarFontes(config);
  } catch (erro) {
    console.error(erro.message);
    process.exit(2);
  }

  // Ausente e undefined, nao false: uma flag que nao foi escrita tem de deixar passar a
  // configuracao, senao qualquer corrida sem a flag voltava a exigir mapa.
  const semMapaCli = resto.includes('--sem-mapa') ? true
    : resto.includes('--com-mapa') ? false
    : undefined;

  let preparado;
  try {
    preparado = prepararCorrida({
      documento,
      config,
      raizCenarios: config.raiz_cenarios,
      pastaCorridas: config.pasta_corridas,
      nivelCli: opcao('--nivel', undefined),
      semMapa: semMapaCli,
    });
  } catch (erro) {
    // Codigo 4 e so para a falta de mapa: e a unica condicao que se resolve com um comando,
    // e quem corre a suite tem de a poder distinguir de configuracao errada.
    console.error(erro.message);
    process.exit(/falta o mapa/.test(erro.message) ? 4 : 2);
  }

  console.error(`a correr ${documento} em ${preparado.pastaTrabalho}, nivel ${preparado.nivel}`);
  const resultado = await executarDocumento({ documento, ...preparado });

  writeFileSync(join(preparado.pastaTrabalho, 'resultado.json'), JSON.stringify(resultado, null, 2), 'utf8');
  const redigidos = redigirEvidencias(preparado.pastaTrabalho, preparado.segredos);
  if (redigidos.length) console.error(`  senha redigida em ${redigidos.length} ficheiro(s) de evidencia`);
  console.log(JSON.stringify({
    documento,
    nivel: preparado.nivel,
    insumos: preparado.insumosUsados,
    estado: resultado.estado,
    metricas: resultado.metricas,
    avisos: resultado.avisos,
  }, null, 2));
  process.exit(resultado.estado === 'concluido' ? 0 : 1);
}

// pathToFileURL, e não interpolação de string: em Windows um caminho `C:\...` produz
// `file:///C:/...` com três barras, e a comparação ingénua nunca dá verdadeira — o comando
// não correria nunca. O argv[1] pode não existir (import a partir do orquestrador, `node -e`),
// e nesse caso isto é uma biblioteca, não um comando.
export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  await principal();
}
