import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validarMapa, caminhoMapa, existeMapa, lerMapa, escreverMapa, accoesNaoExercidas } from '../src/mapa.mjs';

const MAPA_BOM = {
  documento: 'gestao-armazem/registo-entrada.md',
  rota: 'armazem/registo-entrada',
  mapeado_em: '2026-08-19',
  mapeado_contra: { ui: '30446d5', api: 'jar de develop, 2026-08-19' },
  accoes: [
    { id: 'A01', tipo: 'consulta', nome: 'Pesquisar por ciclo', como: 'preencher Ciclo e carregar em Pesquisar',
      entradas: [{ campo: 'Ciclo', obrigatorio: true, origem_valores: 'combobox' }],
      promessa: 'grelha com os registos do ciclo', casos_documento: ['CT-01'] },
    { id: 'A02', tipo: 'criacao', nome: 'Criar ciclo', como: 'botao Novo Ciclo',
      entradas: [], promessa: 'o ciclo aparece na lista', casos_documento: [] },
  ],
  insumos_necessarios: [{ descricao: 'ciclo por usar', obtivel: 'tela' }],
  casos_sem_accao: ['CT-05'],
};

let pasta;
beforeEach(() => { pasta = mkdtempSync(join(tmpdir(), 'mapa-')); });
afterEach(() => { rmSync(pasta, { recursive: true, force: true }); });

describe('validarMapa', () => {
  it('aceita um mapa completo', () => {
    expect(validarMapa(MAPA_BOM)).toEqual({ valido: true, erros: [] });
  });

  it('recusa um mapa sem accoes', () => {
    const { accoes, ...sem } = MAPA_BOM;
    expect(validarMapa(sem).valido).toBe(false);
  });

  it('recusa um tipo de accao desconhecido', () => {
    const ma = { ...MAPA_BOM, accoes: [{ ...MAPA_BOM.accoes[0], tipo: 'dancar' }] };
    expect(validarMapa(ma).valido).toBe(false);
  });

  it('recusa um obtivel desconhecido', () => {
    const ma = { ...MAPA_BOM, insumos_necessarios: [{ descricao: 'x', obtivel: 'magia' }] };
    expect(validarMapa(ma).valido).toBe(false);
  });

  it('aceita um mapa sem casos_sem_accao, que e o caso feliz', () => {
    const { casos_sem_accao, ...sem } = MAPA_BOM;
    expect(validarMapa(sem).valido).toBe(true);
  });
});

describe('caminhoMapa', () => {
  it('separa por sessao e troca a extensao', () => {
    expect(caminhoMapa('mapas', 'gestao-armazem/registo-entrada.md'))
      .toBe(join('mapas', 'gestao-armazem', 'registo-entrada.yaml'));
  });
});

describe('escrever e ler', () => {
  it('escreve, diz que existe, e le de volta igual', () => {
    const caminho = caminhoMapa(pasta, MAPA_BOM.documento);
    expect(existeMapa(caminho)).toBe(false);
    escreverMapa(caminho, MAPA_BOM);
    expect(existeMapa(caminho)).toBe(true);
    expect(lerMapa(caminho)).toEqual(MAPA_BOM);
  });

  it('recusa escrever um mapa invalido, para nao gravar lixo por cima do bom', () => {
    const caminho = caminhoMapa(pasta, MAPA_BOM.documento);
    expect(() => escreverMapa(caminho, { documento: 'x' })).toThrow(/mapa/i);
  });

  it('diz onde falta o mapa em vez de rebentar com ENOENT', () => {
    expect(() => lerMapa(caminhoMapa(pasta, 'a/b.md'))).toThrow(/npm run mapear/);
  });

  it('recusa um ficheiro que existe mas nao valida', () => {
    const caminho = caminhoMapa(pasta, MAPA_BOM.documento);
    escreverMapa(caminho, MAPA_BOM);
    // escrita directa, a saltar a validacao, para simular um mapa editado a mao com erro
    const cru = readFileSync(caminho, 'utf8').replace('tipo: consulta', 'tipo: dancar');
    writeFileSync(caminho, cru, 'utf8');
    expect(() => lerMapa(caminho)).toThrow(/fora do esquema/i);
  });
});

describe('accoesNaoExercidas', () => {
  it('devolve as accoes do mapa que nenhum caso exerceu', () => {
    const resposta = { casos: [{ id: 'CT-01', accao: 'A01' }] };
    expect(accoesNaoExercidas(MAPA_BOM, resposta)).toEqual(['A02']);
  });

  it('devolve vazio quando todas foram exercidas', () => {
    const resposta = { casos: [{ id: 'CT-01', accao: 'A01' }, { id: 'A02', accao: 'A02' }] };
    expect(accoesNaoExercidas(MAPA_BOM, resposta)).toEqual([]);
  });

  it('aceita o id do caso a valer pelo da accao, para respostas sem o campo accao', () => {
    const resposta = { casos: [{ id: 'A01' }, { id: 'A02' }] };
    expect(accoesNaoExercidas(MAPA_BOM, resposta)).toEqual([]);
  });
});
