import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { carregarAlvos } from '../alvos.mjs';
import { carregarSessoes, sessaoDe } from '../sessoes.mjs';
import { prepararMapeamento, prepararRepescagem, documentosPorMapear, mapearDocumento } from './mapear-documento.mjs';
import { mapearSessao, escreverProgresso } from '../mapear-sessao.mjs';

function carregarConfig(caminho) {
  const cru = parse(readFileSync(caminho, 'utf8'));
  const pasta = dirname(caminho);
  return {
    ...cru,
    alvos: carregarAlvos(join(pasta, 'alvos.yaml')),
    sessoes: carregarSessoes(join(pasta, 'sessoes.yaml')),
  };
}

async function principal() {
  const [sessaoId, ...resto] = process.argv.slice(2);
  if (!sessaoId) {
    console.error('uso: npm run mapear-sessao -- <sessao> [--config config/corrida.yaml] [--remapear] [--sem-repescagem]');
    process.exit(2);
  }
  const opcao = (nome, omissao) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : omissao;
  };
  const config = carregarConfig(opcao('--config', 'config/corrida.yaml'));
  const pastaMapas = config.pasta_mapas ?? './mapas';
  const sessao = sessaoDe(config.sessoes, sessaoId);
  const remapear = resto.includes('--remapear');
  const semRepescagem = resto.includes('--sem-repescagem');

  const documentos = documentosPorMapear(config.alvos, sessaoId, pastaMapas, { remapear });
  if (documentos.length === 0) {
    console.error(`nada por mapear em ${sessaoId}; usar --remapear para refazer os que ja tem mapa`);
    process.exit(0);
  }
  console.error(`a mapear ${documentos.length} documento(s) de ${sessaoId}, em serie`);

  // Progresso a meio da corrida, no mesmo sitio onde ficam as capturas. Sem isto o custo so se
  // sabe no fim, e uma corrida de duas horas nao se consegue acompanhar.
  const caminhoProgresso = resolve(config.pasta_corridas, `mapeamento-${sessaoId}.json`);
  console.error(`progresso em ${caminhoProgresso}`);

  const mapear = async (documento) => {
    const preparado = prepararMapeamento({
      documento,
      config,
      raizCenarios: config.raiz_cenarios,
      pastaCorridas: config.pasta_corridas,
      perfil: sessao.perfil,
    });
    // A segunda passagem tem de vir ligada tambem aqui: sem isto, uma sessao inteira mapeava
    // com uma so passagem e a falta so se via depois de paga.
    const repescar = semRepescagem ? null : (alvos) => prepararRepescagem({
      documento,
      config,
      raizCenarios: config.raiz_cenarios,
      pastaCorridas: config.pasta_corridas,
      perfil: sessao.perfil,
      alvos,
    });
    const resultado = await mapearDocumento({ documento, preparado, pastaMapas, repescar });
    console.error(`${documento}: ${resultado.estado}`);
    return resultado;
  };

  // O custo acumulado vai para o terminal a cada documento, e nao so para o ficheiro: quem
  // esta a ver correr quer saber quanto ja gastou sem ter de abrir JSON nenhum.
  const publicar = (progresso) => {
    escreverProgresso(caminhoProgresso, progresso);
    const feitos = progresso.documentos.length;
    console.error(
      `  ${feitos}/${feitos + progresso.por_correr.length} documentos, $${progresso.custoUsd.toFixed(2)} ate agora`,
    );
  };

  const resumo = await mapearSessao({ sessao: sessaoId, documentos }, { mapear, publicar });
  console.log(JSON.stringify(resumo, null, 2));
  process.exit(resumo.documentos.every((r) => r.estado === 'concluido') ? 0 : 1);
}

export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  await principal();
}
