import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepararCorrida } from '../src/cli/correr-documento.mjs';
import { caminhoMapa, escreverMapa } from '../src/mapa.mjs';
import { carregarInsumos } from '../src/insumos.mjs';

function mapaTemporario(documento = 'area/tela.md', rota = '/area/tela') {
  const pastaMapas = mkdtempSync(join(tmpdir(), 'mapas-'));
  escreverMapa(caminhoMapa(pastaMapas, documento), {
    documento, rota, mapeado_em: '2026-08-31',
    accoes: [{ id: 'A01', tipo: 'consulta', nome: 'Pesquisar', como: 'carregar em Pesquisar',
               promessa: 'grelha com resultados', casos_documento: ['CT-01'] }],
    casos_sem_accao: [],
  });
  return pastaMapas;
}

function cenarioTemporario() {
  const raiz = mkdtempSync(join(tmpdir(), 'cen-'));
  mkdirSync(join(raiz, 'area'));
  writeFileSync(join(raiz, 'area', 'tela.md'), '### CT-01\nmassa: factura E017-1', 'utf8');
  return raiz;
}

function insumosTemporarios(texto) {
  const dir = mkdtempSync(join(tmpdir(), 'ins-'));
  const caminho = join(dir, 'insumos.yaml');
  writeFileSync(caminho, texto, 'utf8');
  return carregarInsumos(caminho);
}

const YAML = `
fontes:
  docs: { tipo: git, url: https://exemplo/docs.git }
por_documento:
  area/tela.md:
    - docs:requisitos/tela.md
`;

function cacheCom(ficheiros) {
  const raiz = mkdtempSync(join(tmpdir(), 'cache-'));
  for (const [caminho, conteudo] of Object.entries(ficheiros)) {
    const destino = join(raiz, caminho);
    mkdirSync(join(destino, '..'), { recursive: true });
    writeFileSync(destino, conteudo, 'utf8');
  }
  return raiz;
}

const BASE = {
  base_url: 'http://localhost:4174',
  modelo: 'sonnet',
  timeout_ms: 60000,
  imagens: 'allow',
  alvos: new Map([['area/tela.md', { rota: '/area/tela', sessao: 'area', escrita: false }]]),
};

function preparar({ config, raizInsumos }) {
  return prepararCorrida({
    documento: 'area/tela.md',
    config,
    raizCenarios: cenarioTemporario(),
    pastaCorridas: mkdtempSync(join(tmpdir(), 'corr-')),
    pastaMapas: mapaTemporario(),
    raizInsumos,
  });
}

describe('prepararCorrida com insumos', () => {
  it('mete o requisito tecnico no enunciado', () => {
    const config = { ...BASE, insumos: insumosTemporarios(YAML) };
    const raizInsumos = cacheCom({ 'docs/requisitos/tela.md': 'O ciclo é obrigatório.' });
    const p = preparar({ config, raizInsumos });
    expect(p.enunciado).toContain('REQUISITOS TÉCNICOS');
    expect(p.enunciado).toContain('O ciclo é obrigatório.');
  });

  // Fica no resultado.json: sem saber que requisitos entraram, nao se explica porque e que o
  // mesmo documento deu veredictos diferentes em duas corridas.
  it('devolve as referencias dos insumos que entraram', () => {
    const config = { ...BASE, insumos: insumosTemporarios(YAML) };
    const raizInsumos = cacheCom({ 'docs/requisitos/tela.md': 'O ciclo é obrigatório.' });
    expect(preparar({ config, raizInsumos }).insumosUsados).toEqual(['docs:requisitos/tela.md']);
  });

  it('rebenta quando um insumo declarado nao esta na cache', () => {
    const config = { ...BASE, insumos: insumosTemporarios(YAML) };
    expect(() => preparar({ config, raizInsumos: cacheCom({}) })).toThrow(/insumo em falta/);
  });

  // Retro-compatibilidade: a suite corria sem insumos nenhuns e tem de continuar a correr.
  it('corre na mesma quando nao ha configuracao de insumos', () => {
    const p = preparar({ config: BASE, raizInsumos: cacheCom({}) });
    expect(p.enunciado).not.toContain('REQUISITOS TÉCNICOS');
    expect(p.insumosUsados).toEqual([]);
  });
});

// Corrida sem mapa: o levantamento previo deixa de existir e o ambito passa a ser o documento
// de cenarios mais o requisito tecnico.
describe('prepararCorrida sem mapa', () => {
  const semMapa = (extra = {}) => prepararCorrida({
    documento: 'area/tela.md',
    config: BASE,
    raizCenarios: cenarioTemporario(),
    pastaCorridas: mkdtempSync(join(tmpdir(), 'corr-')),
    raizInsumos: cacheCom({}),
    semMapa: true,
    ...extra,
  });

  it('nao exige mapa nenhum', () => {
    expect(() => semMapa({ pastaMapas: mkdtempSync(join(tmpdir(), 'vazio-')) })).not.toThrow();
  });

  it('ignora de proposito um mapa que exista, para a corrida ser comparavel', () => {
    const p = semMapa({ pastaMapas: mapaTemporario() });
    expect(p.enunciado).not.toContain('A01');
    expect(p.enunciado).not.toContain('AÇÕES A EXERCER');
  });

  it('manda percorrer a tela e pedir a referencia da documentacao', () => {
    const p = semMapa({ pastaMapas: mapaTemporario() });
    expect(p.enunciado).toMatch(/PERCORRES a tela/);
    expect(p.enunciado).toContain('"referencia"');
  });

  // Com mapa continua a rebentar: quem corre a suite tem de distinguir "esqueci-me de mapear"
  // de "decidi correr sem mapa".
  it('com semMapa a falso, a falta de mapa continua a rebentar', () => {
    expect(() => semMapa({
      pastaMapas: mkdtempSync(join(tmpdir(), 'vazio-')),
      semMapa: false,
    })).toThrow(/falta o mapa/);
  });
});

// O mapa nao foi removido: passou a ser configuravel. Um projeto corre sem ele por
// configuracao, e uma tela que precise mesmo dele volta a exigi-lo no alvos.yaml.
describe('prepararCorrida com usar_mapa configurado', () => {
  const semNada = { pastaMapas: mkdtempSync(join(tmpdir(), 'vazio-')) };
  const correr = (config, extra = {}) => prepararCorrida({
    documento: 'area/tela.md',
    config,
    raizCenarios: cenarioTemporario(),
    pastaCorridas: mkdtempSync(join(tmpdir(), 'corr-')),
    raizInsumos: cacheCom({}),
    ...semNada,
    ...extra,
  });

  it('usar_mapa false no corrida.yaml corre o projeto todo sem mapa', () => {
    const p = correr({ ...BASE, usar_mapa: false });
    expect(p.enunciado).toMatch(/PERCORRES a tela/);
  });

  it('o alvos.yaml volta a exigir o mapa numa tela em especial', () => {
    const alvos = new Map([['area/tela.md', { rota: '/area/tela', sessao: 'area', usar_mapa: true }]]);
    expect(() => correr({ ...BASE, alvos, usar_mapa: false })).toThrow(/falta o mapa/);
  });

  it('a linha de comando ganha a configuracao', () => {
    const p = correr({ ...BASE, usar_mapa: true }, { semMapa: true });
    expect(p.enunciado).toMatch(/PERCORRES a tela/);
  });

  it('sem configuracao nenhuma, o mapa continua obrigatorio', () => {
    expect(() => correr(BASE)).toThrow(/falta o mapa/);
  });
});
