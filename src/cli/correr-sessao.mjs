import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sessaoDe, divergenciasComMenu } from '../sessoes.mjs';
import { corrivel } from '../alvos.mjs';
import { carregarConfigCorrida } from '../config.mjs';
import { sincronizarFontes, versoesParaRegisto } from '../insumos-sincronizar.mjs';
import { seccoesDoMenu } from '../menu.mjs';
import { executarSessao, CONCORRENCIA_OMISSAO } from '../executar-sessao.mjs';
import { verificarAmbiente } from '../ambiente.mjs';
import { executarDocumento } from '../executar-documento.mjs';
import { prepararCorrida } from './correr-documento.mjs';
import { resolverNivel } from '../nivel.mjs';
import { escreverRelatorios } from '../relatorio/escrever.mjs';
import { redigirEvidencias } from '../redigir.mjs';
import { carregarCredenciais, autenticacaoPara } from '../credenciais.mjs';

// Um documento sem rota não é erro da sessão: fica de fora e a corrida segue. É a mesma
// validação preguiçosa do alvos.yaml, aplicada a um conjunto.
export function documentosDaSessao(alvos, sessaoId, apenas = null) {
  const escolhidos = apenas ? new Set(apenas) : null;
  return [...alvos.entries()]
    .filter(([, alvo]) => alvo.sessao === sessaoId)
    .filter(([, alvo]) => corrivel(alvo))
    .map(([documento]) => documento)
    .filter((documento) => !escolhidos || escolhidos.has(documento));
}

// A divergência entre o menu e o sessoes.yaml é aviso e não paragem: há secções sem
// documentos e documentos cuja área não é secção de topo.
function avisarDivergencias(config) {
  if (!config.menu_do_front) return;
  try {
    const seccoes = seccoesDoMenu(readFileSync(config.menu_do_front, 'utf8'));
    for (const aviso of divergenciasComMenu(config.sessoes, seccoes)) console.error(`aviso: ${aviso}`);
  } catch (erro) {
    console.error(`aviso: não consegui ler o menu do front (${erro.message})`);
  }
}

function dataDeHoje() {
  return new Date().toISOString().slice(0, 10);
}

async function principal() {
  const [sessaoId, ...resto] = process.argv.slice(2);
  if (!sessaoId) {
    console.error('uso: npm run correr-sessao -- <sessao> [--config config/corrida.yaml] [--corrida AAAA-MM-DD] [--nivel 1|2|3] [--sem-mapa|--com-mapa]');
    process.exit(2);
  }
  const opcao = (nome, omissao) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : omissao;
  };
  const config = carregarConfigCorrida(opcao('--config', 'config/corrida.yaml'));
  avisarDivergencias(config);

  // Antes da sonda do ambiente: uma fonte de insumo que nao venha e configuracao, e nao vale
  // a pena descobri-lo depois de o backend estar de pe.
  let versoesInsumos;
  try {
    versoesInsumos = sincronizarFontes(config);
  } catch (erro) {
    console.error(erro.message);
    process.exit(2);
  }

  if (!config.sonda_ambiente) {
    console.error('falta sonda_ambiente no corrida.yaml: sem ela nao se sabe se o alvo esta de pe');
    process.exit(2);
  }

  const sessao = sessaoDe(config.sessoes, sessaoId);
  // --apenas serve para retomar uma sessao parada em infra: o resumo dessa deixa a lista em
  // `porCorrer`, e passa-se aqui tal e qual, sem repetir o que ja custou dinheiro.
  const apenas = opcao('--apenas', null);
  // Ausente e undefined, nao false: uma flag que nao foi escrita tem de deixar passar a
  // configuracao, senao qualquer corrida sem a flag voltava a exigir mapa.
  const semMapaCli = resto.includes('--sem-mapa') ? true
    : resto.includes('--com-mapa') ? false
    : undefined;
  const semMapa = semMapaCli;
  const documentos = documentosDaSessao(config.alvos, sessaoId, apenas ? apenas.split(',') : null);
  if (documentos.length === 0) {
    console.error(`a sessão ${sessaoId} não tem documentos com rota ou navegação preenchida`);
    process.exit(2);
  }

  const corrida = opcao('--corrida', dataDeHoje());
  const pastaSessao = resolve(config.pasta_corridas, corrida, sessaoId);
  mkdirSync(pastaSessao, { recursive: true });
  const modo = sessao.paralelo
    ? `em paralelo, ${sessao.concorrencia ?? CONCORRENCIA_OMISSAO} de cada vez`
    : 'em série';
  console.error(`${sessao.titulo}: ${documentos.length} documentos, ${modo}, em ${pastaSessao}`);

  const correr = async (documento) => {
    let preparado;
    try {
      preparado = prepararCorrida({
        documento,
        config,
        raizCenarios: config.raiz_cenarios,
        pastaCorridas: pastaSessao,
        perfil: sessao.perfil,
        nivelCli: opcao('--nivel', undefined),
        // Ignora os mapas que existam: a corrida sem mapa so e comparavel se nenhuma tela
        // levar vantagem por ja ter sido levantada.
        semMapa,
        credencial: sessao.credencial,
        // A data da corrida entra no marcador: diz a que noite pertence um registo deixado
        // para tras.
        hoje: corrida,
      });
    } catch (erro) {
      // Um documento sem mapa nao trava a sessao inteira: fica bloqueado, com a razao escrita,
      // e os outros correm. Mapear e um comando a parte e uma decisao de gasto.
      console.error(`  ${documento}: bloqueado — ${erro.message}`);
      return { estado: 'bloqueado', resposta: null, avisos: [erro.message], metricas: null };
    }
    console.error(`  a correr ${documento}, nivel ${preparado.nivel}`);
    const resultado = { ...await executarDocumento({ documento, ...preparado }), insumos: preparado.insumosUsados };
    writeFileSync(join(preparado.pastaTrabalho, 'resultado.json'), JSON.stringify(resultado, null, 2), 'utf8');
    // Antes de qualquer outra coisa tocar na pasta: as evidencias vao para o git e o despejo
    // do ecra de entrada traz o valor do campo de senha em claro.
    const redigidos = redigirEvidencias(preparado.pastaTrabalho, preparado.segredos);
    if (redigidos.length) console.error(`  ${documento}: senha redigida em ${redigidos.length} ficheiro(s)`);
    console.error(`  ${documento}: ${resultado.estado}`);
    return resultado;
  };

  // Sonda o alvo antes de cada documento, para que uma queda de rede a meio pare a sessao em
  // vez de a encher de bloqueios falsos pagos a preco cheio.
  const verificar = async () => {
    const r = await verificarAmbiente({
      url: config.sonda_ambiente,
      timeoutMs: config.timeout_ambiente_ms ?? 20000,
    });
    if (!r.ok) console.error(`ambiente em baixo: ${r.razao}`);
    return r;
  };

  const resumo = await executarSessao(
    {
      sessao: sessaoId,
      documentos,
      paralelo: sessao.paralelo,
      concorrencia: sessao.concorrencia,
      tentativas: config.tentativas ?? 2,
    },
    { correr, verificar },
  );

  // O nivel fica no resumo: um veredicto sem a regua com que foi dado nao se compara com o da
  // noite anterior.
  const comNivel = {
    ...resumo,
    nivel: resolverNivel({ cli: opcao('--nivel', undefined), global: config.nivel }),
    versoes_insumos: versoesParaRegisto(versoesInsumos),
  };
  writeFileSync(join(pastaSessao, 'sessao.json'), JSON.stringify(comNivel, null, 2), 'utf8');
  // O sessao.json escreve-se na RAIZ da sessao e depois de todos os documentos, portanto nao
  // e apanhado pela redacao de cada pasta -- e leva la dentro a resposta inteira de cada
  // agente, incluindo o que ele tenha citado do formulario de entrada.
  const segredosDaSessao = autenticacaoPara(config.credenciais ?? carregarCredenciais(''), sessao.credencial);
  if (segredosDaSessao) redigirEvidencias(pastaSessao, [segredosDaSessao.senha]);
  console.log(JSON.stringify(comNivel, null, 2));

  // O relatorio sai com a corrida: uma corrida que termina sem HTML e uma corrida que ninguem
  // ve. Falhar a gera-lo nao pode perder a corrida, que ja custou -- avisa e segue.
  try {
    const { indice, sessoes } = escreverRelatorios(config.pasta_corridas, corrida, config.sessoes, sessaoId);
    for (const caminho of sessoes) console.error(`  relatorio: ${caminho}`);
    console.error(`  relatorio: ${indice}`);
  } catch (erro) {
    console.error(`  aviso: relatorio nao gerado (${erro.message}); correr 'npm run relatorio -- ${corrida}'`);
  }

  if (resumo.estado === 'infra') {
    console.error(`sessao parada: ${resumo.razao}. Por correr: ${resumo.porCorrer.join(', ')}`);
    process.exit(3);
  }
  process.exit(resumo.documentos.some((d) => d.estado === 'erro') ? 1 : 0);
}

export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  await principal();
}
