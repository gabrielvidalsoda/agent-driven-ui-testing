import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepararMapeamento, documentosPorMapear, mapearDocumento, telasIrmas, prepararRepescagem, repescarDocumento } from '../src/cli/mapear-documento.mjs';
import { caminhoMapa, escreverMapa, lerMapa } from '../src/mapa.mjs';

let raiz;
beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'mapear-'));
  mkdirSync(join(raiz, 'cenarios', 'gestao-armazem'), { recursive: true });
  writeFileSync(join(raiz, 'cenarios', 'gestao-armazem', 'registo-entrada.md'), '# CT-01 Pesquisar\n', 'utf8');
});
afterEach(() => { rmSync(raiz, { recursive: true, force: true }); });

const CONFIG = () => ({
  base_url: 'http://localhost:4174',
  imagens: 'allow',
  modelo: 'sonnet',
  timeout_ms: 1000,
  bare: false,
  alvos: new Map([['gestao-armazem/registo-entrada.md',
    { rota: 'armazem/registo-entrada', sessao: 'gestao-armazem', escrita: true }]]),
});

const cenario = () => ({
  documento: 'gestao-armazem/registo-entrada.md',
  config: CONFIG(),
  raizCenarios: join(raiz, 'cenarios'),
  pastaCorridas: join(raiz, 'corridas'),
});

const MAPA_MINIMO = {
  documento: 'gestao-armazem/registo-entrada.md',
  rota: 'armazem/registo-entrada',
  mapeado_em: '2026-08-19',
  accoes: [{ id: 'A01', tipo: 'consulta', nome: 'Pesquisar', como: 'carregar em Pesquisar',
             promessa: 'grelha com resultados', casos_documento: ['CT-01'] }],
};

describe('prepararMapeamento', () => {
  it('monta o enunciado do mapeador, nao o do testador', () => {
    const p = prepararMapeamento(cenario());
    expect(p.enunciado).toMatch(/NÃO SUBMETES/);
    expect(p.enunciado).toContain('http://localhost:4174/armazem/registo-entrada');
    expect(p.enunciado).not.toMatch(/marcador/i);
  });

  it('escreve a pasta de trabalho com o sufixo do mapeamento, para nao pisar a corrida', () => {
    const p = prepararMapeamento(cenario());
    expect(p.pastaTrabalho).toMatch(/gestao-armazem__registo-entrada__mapa$/);
  });
});

describe('mapearDocumento', () => {
  const respostaDoAgente = (mapa) => async () => ({
    codigo: 0,
    stdout: JSON.stringify({ result: JSON.stringify(mapa) }),
    stderr: '',
  });

  it('grava o mapa devolvido pelo agente', async () => {
    const pastaMapas = join(raiz, 'mapas');
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()), pastaMapas, repescar: null },
      { lancar: respostaDoAgente(MAPA_MINIMO) },
    );
    expect(r.estado).toBe('concluido');
    expect(lerMapa(r.caminho)).toEqual(MAPA_MINIMO);
  });

  it('nao grava nada quando o agente devolve um mapa fora do esquema', async () => {
    const pastaMapas = join(raiz, 'mapas');
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()), pastaMapas, repescar: null },
      { lancar: respostaDoAgente({ documento: 'x' }) },
    );
    expect(r.estado).toBe('erro');
    expect(r.caminho).toBeUndefined();
  });
});

describe('documentosPorMapear', () => {
  const alvos = () => new Map([
    ['gestao-armazem/registo-entrada.md', { rota: 'armazem/registo-entrada', sessao: 'gestao-armazem' }],
    ['gestao-armazem/preparacao.md', { rota: 'armazem/preparacao', sessao: 'gestao-armazem' }],
    ['gestao-armazem/por-preencher.md', { rota: 'POR_PREENCHER', sessao: 'gestao-armazem' }],
    ['conferencia/cockpit.md', { rota: 'conferencia/cockpit', sessao: 'conferencia' }],
  ]);

  function comMapaDePreparacao() {
    const pastaMapas = join(raiz, 'mapas');
    escreverMapa(caminhoMapa(pastaMapas, 'gestao-armazem/preparacao.md'), {
      documento: 'gestao-armazem/preparacao.md', rota: 'armazem/preparacao', mapeado_em: '2026-08-19',
      accoes: [{ id: 'A01', tipo: 'consulta', nome: 'n', como: 'c', promessa: 'p' }],
    });
    return pastaMapas;
  }

  it('devolve os da sessao que ainda nao tem mapa', () => {
    expect(documentosPorMapear(alvos(), 'gestao-armazem', comMapaDePreparacao(), {}))
      .toEqual(['gestao-armazem/registo-entrada.md']);
  });

  it('com --remapear devolve todos os da sessao com rota', () => {
    expect(documentosPorMapear(alvos(), 'gestao-armazem', comMapaDePreparacao(), { remapear: true }))
      .toEqual(['gestao-armazem/registo-entrada.md', 'gestao-armazem/preparacao.md']);
  });

  it('deixa de fora um documento sem rota', () => {
    const todos = documentosPorMapear(alvos(), 'gestao-armazem', join(raiz, 'vazio'), { remapear: true });
    expect(todos).not.toContain('gestao-armazem/por-preencher.md');
  });

  it('nao mistura sessoes', () => {
    expect(documentosPorMapear(alvos(), 'conferencia', join(raiz, 'vazio'), {}))
      .toEqual(['conferencia/cockpit.md']);
  });
});

const CONFIG_SESSAO = () => ({
  base_url: 'http://localhost:4174',
  imagens: 'allow', modelo: 'sonnet', timeout_ms: 1000, bare: false,
  alvos: new Map([
    ['gestao-armazem/registo-entrada.md', { rota: 'armazem/registo-entrada', sessao: 'gestao-armazem' }],
    ['gestao-armazem/preparacao.md', { rota: 'armazem/preparacao', sessao: 'gestao-armazem' }],
    ['gestao-armazem/por-preencher.md', { rota: 'POR_PREENCHER', sessao: 'gestao-armazem' }],
    ['conferencia/cockpit.md', { rota: 'conferencia/cockpit', sessao: 'conferencia' }],
  ]),
});

describe('telasIrmas', () => {
  it('devolve as outras telas da mesma seccao, com o url resolvido', () => {
    const irmas = telasIrmas({ documento: 'gestao-armazem/registo-entrada.md', config: CONFIG_SESSAO() });
    expect(irmas).toEqual([
      { documento: 'gestao-armazem/preparacao.md', url: 'http://localhost:4174/armazem/preparacao' },
    ]);
  });

  it('nao inclui o proprio documento nem outras sessoes nem rotas por preencher', () => {
    const urls = telasIrmas({ documento: 'gestao-armazem/registo-entrada.md', config: CONFIG_SESSAO() })
      .map((i) => i.documento);
    expect(urls).not.toContain('gestao-armazem/registo-entrada.md');
    expect(urls).not.toContain('conferencia/cockpit.md');
    expect(urls).not.toContain('gestao-armazem/por-preencher.md');
  });
});

describe('repescagem encadeada no mapeamento', () => {
  const MAPA_COM_BURACO = {
    ...MAPA_MINIMO,
    insumos_necessarios: [{ descricao: 'registo concluído', obtivel: 'nao', razao: 'sem acção' }],
    casos_sem_accao: ['CT-05'],
  };
  const MAPA_SEM_BURACO = { ...MAPA_MINIMO, insumos_necessarios: [{ descricao: 'x', obtivel: 'tela' }] };

  const respostas = (lista) => {
    let n = 0;
    return async () => ({
      codigo: 0,
      stdout: JSON.stringify({ result: JSON.stringify(lista[n++]) }),
      stderr: '',
    });
  };

  const repescar = () => prepararRepescagem({
    documento: 'gestao-armazem/registo-entrada.md',
    config: CONFIG(),
    raizCenarios: join(raiz, 'cenarios'),
    pastaCorridas: join(raiz, 'corridas'),
    alvos: [{ alvo: 'CT-05', tipo: 'caso' }],
  });

  it('corre a segunda passagem e funde o que ela encontrou', async () => {
    const achou = {
      documento: 'gestao-armazem/registo-entrada.md',
      alvos: [{ alvo: 'CT-05', procurei: ['Encerrar'], onde: ['Preparação'], resultado: 'encontrado',
                captura: 'encerrar.png',
                accao: { id: 'ac-encerrar', tipo: 'edicao', nome: 'Encerrar', como: 'botão',
                         promessa: 'passa a fechado', rota: 'armazem/preparacao', casos_documento: ['CT-05'] } }],
    };
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar },
      { lancar: respostas([MAPA_COM_BURACO, achou]) },
    );
    expect(r.alvosRepescados).toBe(2);
    expect(lerMapa(r.caminho).accoes.map((a) => a.id)).toContain('ac-encerrar');
    expect(lerMapa(r.caminho).casos_sem_accao).toEqual([]);
  });

  it('nao corre a segunda passagem quando nao ha nada por encontrar', async () => {
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar },
      { lancar: respostas([MAPA_SEM_BURACO]) },
    );
    expect(r.alvosRepescados).toBe(0);
    expect(lerMapa(r.caminho).repescagem).toBeUndefined();
  });

  it('uma repescagem que rebenta nao deita fora a primeira passagem', async () => {
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar },
      { lancar: respostas([MAPA_COM_BURACO, { lixo: true }]) },
    );
    expect(r.estado).toBe('concluido');
    expect(lerMapa(r.caminho).casos_sem_accao).toEqual(['CT-05']);
    expect(r.avisos.join(' ')).toMatch(/repescagem falhou/);
  });

  it('--sem-repescagem salta a segunda passagem', async () => {
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar: null },
      { lancar: respostas([MAPA_COM_BURACO]) },
    );
    expect(lerMapa(r.caminho).repescagem).toBeUndefined();
    expect(lerMapa(r.caminho).casos_sem_accao).toEqual(['CT-05']);
  });

  it('soma o custo das duas passagens', async () => {
    const achou = { documento: 'gestao-armazem/registo-entrada.md',
                    alvos: [{ alvo: 'CT-05', procurei: ['x'], onde: ['y'], resultado: 'nao_existe' }] };
    let n = 0;
    const lista = [MAPA_COM_BURACO, achou];
    const lancar = async () => ({
      codigo: 0,
      stdout: JSON.stringify({ result: JSON.stringify(lista[n++]), total_cost_usd: 2 }),
      stderr: '',
    });
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar },
      { lancar },
    );
    expect(r.metricas.custoUsd).toBe(4);
  });
});

describe('repescarDocumento, sem repetir a primeira passagem', () => {
  const escreverBase = (mapa) => {
    const pastaMapas = join(raiz, 'mapas');
    escreverMapa(caminhoMapa(pastaMapas, 'gestao-armazem/registo-entrada.md'), mapa);
    return pastaMapas;
  };
  const repescar = () => prepararRepescagem({
    documento: 'gestao-armazem/registo-entrada.md',
    config: CONFIG(),
    raizCenarios: join(raiz, 'cenarios'),
    pastaCorridas: join(raiz, 'corridas'),
    alvos: [{ alvo: 'CT-05', tipo: 'caso' }],
  });

  it('le o mapa em disco, repesca, e grava o fundido', async () => {
    const pastaMapas = escreverBase({ ...MAPA_MINIMO, casos_sem_accao: ['CT-05'] });
    const achou = {
      documento: 'gestao-armazem/registo-entrada.md',
      alvos: [{ alvo: 'CT-05', procurei: ['Encerrar'], onde: ['Preparação'], resultado: 'encontrado',
                captura: 'encerrar.png',
                accao: { id: 'ac-encerrar', tipo: 'edicao', nome: 'Encerrar', como: 'botão',
                         promessa: 'passa a fechado', rota: 'armazem/preparacao' } }],
    };
    const r = await repescarDocumento({ documento: 'gestao-armazem/registo-entrada.md', pastaMapas, repescar },
      { lancar: async () => ({ codigo: 0, stdout: JSON.stringify({ result: JSON.stringify(achou) }), stderr: '' }) });
    expect(lerMapa(r.caminho).accoes.map((a) => a.id)).toContain('ac-encerrar');
    expect(lerMapa(r.caminho).casos_sem_accao).toEqual([]);
  });

  it('nao lanca agente nenhum quando nao ha nada por repescar', async () => {
    const pastaMapas = escreverBase(MAPA_MINIMO);
    let lancou = false;
    const r = await repescarDocumento({ documento: 'gestao-armazem/registo-entrada.md', pastaMapas, repescar },
      { lancar: async () => { lancou = true; return { codigo: 0, stdout: '{}', stderr: '' }; } });
    expect(lancou).toBe(false);
    expect(r.avisos).toContain('nada por repescar');
    expect(r.metricas).toBeNull();
  });

  it('rebenta com instrucoes quando nao ha mapa nenhum', async () => {
    await expect(repescarDocumento({ documento: 'gestao-armazem/registo-entrada.md',
      pastaMapas: join(raiz, 'vazio'), repescar })).rejects.toThrow(/npm run mapear/);
  });
});

// Regressao real: o comando de sessao chamava mapearDocumento sem `repescar`, e uma sessao
// inteira mapeava com uma so passagem — falta que so se veria depois de paga.
describe('guarda do repescar', () => {
  it('rebenta quando quem chama se esquece de decidir', async () => {
    await expect(mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas') },
    )).rejects.toThrow(/falta decidir `repescar`/);
  });

  it('aceita null como decisao explicita de nao repescar', async () => {
    const MAPA_COM_BURACO = { ...MAPA_MINIMO, casos_sem_accao: ['CT-05'] };
    const r = await mapearDocumento(
      { documento: 'gestao-armazem/registo-entrada.md', preparado: prepararMapeamento(cenario()),
        pastaMapas: join(raiz, 'mapas'), repescar: null },
      { lancar: async () => ({ codigo: 0, stdout: JSON.stringify({ result: JSON.stringify(MAPA_COM_BURACO) }), stderr: '' }) },
    );
    expect(lerMapa(r.caminho).repescagem).toBeUndefined();
  });
});
