import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { parse } from 'yaml';
import { carregarAlvos, alvoDe, urlDe } from '../src/alvos.mjs';
import { lerMapa, caminhoMapa } from '../src/mapa.mjs';
import { montarEnunciado } from '../src/enunciado.mjs';
import { atoEntrada, atoEnunciado, atoGuardas, atoNiveis, atoReal } from '../src/demo.mjs';

const DOCUMENTO = 'gestao-armazem/associacao-caixa.md';
const CORRIDA_MEDIDA = '2026-08-18';

const ATOS = ['entrada', 'enunciado', 'guardas', 'niveis', 'real'];

function carregarConfig(caminho) {
  const cru = parse(readFileSync(caminho, 'utf8'));
  return { ...cru, alvos: carregarAlvos(join(dirname(caminho), 'alvos.yaml')) };
}

function cabecalho(numero, titulo, subtitulo) {
  const barra = '='.repeat(78);
  return ['', barra, `  ATO ${numero} — ${titulo}`, `  ${subtitulo}`, barra, ''].join('\n');
}

function contarCasos(texto) {
  return new Set(texto.match(/\bCT-\d{2}\b/g) ?? []).size;
}

// Lidos da corrida gravada em disco, e nao de uma tabela escrita a mao: os numeros da
// apresentacao sao os mesmos que estao nos ficheiros, e quem quiser confirma-os por `cat`.
function documentosDaCorridaMedida(pastaCorridas, corrida) {
  const pasta = resolve(pastaCorridas, corrida);
  if (!existsSync(pasta)) return [];
  const documentos = [];
  for (const sessao of readdirSync(pasta)) {
    const pastaSessao = join(pasta, sessao);
    if (!statSync(pastaSessao).isDirectory()) continue;
    for (const nome of readdirSync(pastaSessao)) {
      const caminho = join(pastaSessao, nome, 'resultado.json');
      if (!existsSync(caminho)) continue;
      const resultado = JSON.parse(readFileSync(caminho, 'utf8'));
      const casos = resultado.resposta?.casos ?? [];
      const veredicto = (qual) => casos.filter((caso) => caso.veredicto === qual).length;
      documentos.push({
        nome: nome.replace(/^.*__/, ''),
        casos: casos.length,
        passa: veredicto('passa'),
        falha: veredicto('falha'),
        bloqueado: veredicto('bloqueado'),
        achados: (resultado.resposta?.achados ?? []).length,
        custo: resultado.metricas?.custoUsd ?? 0,
      });
    }
  }
  return documentos.sort((a, b) => a.nome.localeCompare(b.nome));
}

async function principal() {
  const escolhidos = process.argv.slice(2).filter((arg) => ATOS.includes(arg));
  const correr = escolhidos.length > 0 ? escolhidos : ATOS;

  const config = carregarConfig('config/corrida.yaml');
  const pastaMapas = config.pasta_mapas ?? './mapas';
  const mapa = lerMapa(caminhoMapa(pastaMapas, DOCUMENTO));
  const texto = readFileSync(join(config.raiz_cenarios, DOCUMENTO), 'utf8');

  const partes = {
    entrada: () => [
      cabecalho(1, 'O QUE ENTRA', 'o documento diz o esperado; o mapa diz o que a tela entrega'),
      ...atoEntrada({ mapa, casosDoDocumento: contarCasos(texto) }),
    ],
    enunciado: () => [
      cabecalho(2, 'O QUE O AGENTE RECEBE', 'um enunciado com regras, nao um script de passos'),
      ...atoEnunciado({
        enunciado: montarEnunciado({
          documento: DOCUMENTO,
          texto,
          url: urlDe(config.base_url, alvoDe(config.alvos, DOCUMENTO)),
          pastaEvidencias: '<pasta da corrida>',
          marcador: 'AGENTE-20260821-associacao-caixa',
          mapa,
          nivel: 2,
          comandoBd: 'bash scripts/bd.sh',
        }),
      }),
    ],
    guardas: () => [
      cabecalho(3, 'AS GUARDAS', 'o que a maquina corrige na resposta do agente, sem lhe pedir licenca'),
      ...atoGuardas({ mapa }),
    ],
    niveis: () => [
      cabecalho(4, 'A MESMA CORRIDA, TRES REGUAS', 'nivel 1 ve tudo, nivel 3 ve so o que trava trabalho'),
      ...atoNiveis({ mapa }),
    ],
    real: () => {
      const documentos = documentosDaCorridaMedida(config.pasta_corridas, CORRIDA_MEDIDA);
      if (documentos.length === 0) {
        return [cabecalho(5, 'A CORRIDA MEDIDA', 'sem dados'),
          `nao encontrei corridas em ${resolve(config.pasta_corridas, CORRIDA_MEDIDA)}`];
      }
      return [
        cabecalho(5, `A CORRIDA MEDIDA DE ${CORRIDA_MEDIDA}`, 'numeros lidos dos ficheiros da corrida, nao escritos a mao'),
        ...atoReal({ documentos }),
      ];
    },
  };

  console.log('');
  console.log('  Suite de testes de tela por agentes — demonstracao');
  console.log('  Agente gravado. Custo zero, sem VPN, sem stack. Os modulos sao os de producao.');

  // Sem pausa, os cinco atos passam de rajada e ninguem os le. Numa sala, o ritmo e quem
  // apresenta que o marca.
  // Num terminal a serio ha quem carregue no Enter; num pipe nao ha, e esperar seria pendurar
  // o comando. Sem terminal, --pausa e ignorado e os atos correm de seguida.
  const pausar = process.argv.includes('--pausa') && process.stdin.isTTY;
  const leitor = pausar ? await abrirLeitor() : null;
  for (const [i, ato] of correr.entries()) {
    console.log(partes[ato]().join('\n'));
    if (leitor && i < correr.length - 1) {
      await leitor.question(`\n  [Enter] para o ato ${i + 2} de ${correr.length} `);
    }
  }
  leitor?.close();
  console.log('');
}

// Um so leitor para a corrida toda. Abrir e fechar um por pausa termina o stdin, e os atos
// seguintes passam sem esperar por ninguem.
async function abrirLeitor() {
  const { createInterface } = await import('node:readline/promises');
  return createInterface({ input: process.stdin, output: process.stdout });
}

await principal();
