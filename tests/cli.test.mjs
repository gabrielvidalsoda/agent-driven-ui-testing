import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { prepararCorrida, foiInvocadoComoComando } from '../src/cli/correr-documento.mjs';
import { caminhoMapa, escreverMapa } from '../src/mapa.mjs';

// O mapa e pre-requisito da corrida: e ele que define o ambito do que se testa.
function mapaTemporario(documento = 'area/tela.md', rota = '/area/tela') {
  const pastaMapas = mkdtempSync(join(tmpdir(), 'mapas-'));
  escreverMapa(caminhoMapa(pastaMapas, documento), {
    documento, rota, mapeado_em: '2026-08-19',
    accoes: [{ id: 'A01', tipo: 'consulta', nome: 'Pesquisar', como: 'carregar em Pesquisar',
               promessa: 'grelha com resultados', casos_documento: ['CT-01'] }],
    casos_sem_accao: ['CT-09'],
  });
  return pastaMapas;
}

function cenarioTemporario() {
  const raiz = mkdtempSync(join(tmpdir(), 'cen-'));
  mkdirSync(join(raiz, 'area'));
  writeFileSync(join(raiz, 'area', 'tela.md'), '### CT-01\nmassa: factura E017-1', 'utf8');
  return raiz;
}

const CONFIG = {
  base_url: 'http://localhost:4174',
  modelo: 'sonnet',
  timeout_ms: 60000,
  imagens: 'allow',
  alvos: new Map([['area/tela.md', { rota: '/area/tela', sessao: 'area', escrita: false }]]),
};

describe('foiInvocadoComoComando', () => {
  // Com `node -e` ou a partir do orquestrador, process.argv[1] pode não existir. A guarda
  // que decide se corre como comando não pode rebentar nesse caso — rebentava, e só se viu
  // ao importar o módulo de fora do vitest.
  it('devolve falso, sem rebentar, quando não há process.argv[1]', () => {
    const guardado = process.argv[1];
    try {
      delete process.argv[1];
      expect(foiInvocadoComoComando()).toBe(false);
    } finally {
      process.argv[1] = guardado;
    }
  });

  it('devolve falso quando o argv[1] é outro ficheiro', () => {
    const guardado = process.argv[1];
    try {
      process.argv[1] = 'C:/outro/ficheiro.mjs';
      expect(foiInvocadoComoComando()).toBe(false);
    } finally {
      process.argv[1] = guardado;
    }
  });
});

describe('prepararCorrida', () => {
  it('cria a pasta de trabalho da corrida', () => {
    const pastaCorridas = mkdtempSync(join(tmpdir(), 'corr-'));
    const p = prepararCorrida({ documento: 'area/tela.md', config: CONFIG, raizCenarios: cenarioTemporario(), pastaCorridas, pastaMapas: mapaTemporario() });
    expect(existsSync(p.pastaTrabalho)).toBe(true);
    expect(existsSync(p.caminhoMcp)).toBe(true);
  });

  it('mete o url resolvido e a massa do documento no enunciado', () => {
    const pastaCorridas = mkdtempSync(join(tmpdir(), 'corr-'));
    const p = prepararCorrida({ documento: 'area/tela.md', config: CONFIG, raizCenarios: cenarioTemporario(), pastaCorridas, pastaMapas: mapaTemporario() });
    expect(p.enunciado).toContain('http://localhost:4174/area/tela');
    expect(p.enunciado).toContain('factura E017-1');
  });

  // O processo do agente e lancado com cwd na pasta de trabalho. Um caminho relativo
  // resolve-se duas vezes e da uma pasta duplicada que nao existe.
  it('devolve caminhos absolutos, porque o agente corre com cwd na pasta de trabalho', () => {
    const pastaCorridas = mkdtempSync(join(tmpdir(), 'corr-'));
    const p = prepararCorrida({ documento: 'area/tela.md', config: CONFIG, raizCenarios: cenarioTemporario(), pastaCorridas, pastaMapas: mapaTemporario() });
    expect(isAbsolute(p.pastaTrabalho)).toBe(true);
    expect(isAbsolute(p.caminhoMcp)).toBe(true);
  });

  it('funciona quando pastaCorridas e relativa', () => {
    const p = prepararCorrida({ documento: 'area/tela.md', config: CONFIG, raizCenarios: cenarioTemporario(), pastaCorridas: './corridas-de-teste', pastaMapas: mapaTemporario() });
    expect(isAbsolute(p.pastaTrabalho)).toBe(true);
    expect(existsSync(p.caminhoMcp)).toBe(true);
    rmSync('./corridas-de-teste', { recursive: true, force: true });
  });

  it('lanca quando o documento nao esta em alvos.yaml', () => {
    const pastaCorridas = mkdtempSync(join(tmpdir(), 'corr-'));
    expect(() => prepararCorrida({ documento: 'nao/existe.md', config: CONFIG, raizCenarios: cenarioTemporario(), pastaCorridas, pastaMapas: mapaTemporario() }))
      .toThrow(/nao\/existe\.md/);
  });
});

describe('prepararCorrida com mapa', () => {
  const cenario = () => ({ documento: 'area/tela.md', config: CONFIG,
                           raizCenarios: cenarioTemporario(),
                           pastaCorridas: mkdtempSync(join(tmpdir(), 'corr-')) });

  it('rebenta com instrucoes quando falta o mapa', () => {
    const pastaMapas = mkdtempSync(join(tmpdir(), 'vazio-'));
    expect(() => prepararCorrida({ ...cenario(), pastaMapas })).toThrow(/npm run mapear/);
  });

  it('leva as accoes do mapa e o nivel para o enunciado', () => {
    const p = prepararCorrida({ ...cenario(), pastaMapas: mapaTemporario(), nivelCli: 3 });
    expect(p.enunciado).toContain('A01');
    expect(p.enunciado).toMatch(/NÍVEL DE DETALHE: 3/);
    expect(p.nivel).toBe(3);
  });

  it('o nivel do documento ganha ao global quando nao ha --nivel', () => {
    const config = { ...CONFIG, nivel: 2,
                     alvos: new Map([['area/tela.md', { rota: '/area/tela', sessao: 'area', escrita: false, nivel: 1 }]]) };
    const p = prepararCorrida({ ...cenario(), config, pastaMapas: mapaTemporario() });
    expect(p.nivel).toBe(1);
  });

  it('o marcador leva a data, para se distinguirem corridas do mesmo documento', () => {
    const p = prepararCorrida({ ...cenario(), pastaMapas: mapaTemporario(), hoje: '2026-08-19' });
    expect(p.marcador).toBe('AGENTE-20260819-tela');
    expect(p.enunciado).toContain('AGENTE-20260819-tela');
  });

  it('so oferece a base de dados quando ha ligacao configurada', () => {
    const sem = prepararCorrida({ ...cenario(), pastaMapas: mapaTemporario(), ligacaoBd: null });
    expect(sem.enunciado).not.toMatch(/bd\.sh/);
    expect(sem.ambienteExtra).toEqual({});
    const com = prepararCorrida({ ...cenario(), pastaMapas: mapaTemporario(), ligacaoBd: 'u/s@//h:1521/ACCQUA' });
    expect(com.enunciado).toMatch(/bd\.sh consultar/);
    expect(com.ambienteExtra.CCMSNS_BD_LIGACAO).toBe('u/s@//h:1521/ACCQUA');
  });
});
