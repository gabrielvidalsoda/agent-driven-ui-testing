import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recolherDia, recolherSessao, contarVeredictos } from '../src/relatorio/recolher.mjs';

function corridaTemporaria() {
  return mkdtempSync(join(tmpdir(), 'corridas-'));
}

function escreverDocumento(raizData, sessao, doc, resultado, capturas = []) {
  const pasta = join(raizData, sessao, doc);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado), 'utf8');
  for (const c of capturas) writeFileSync(join(pasta, c), 'png-falso', 'utf8');
  return pasta;
}

function documento(casos, extra = {}) {
  return {
    estado: 'concluido',
    resposta: { documento: 'area/tela', corrida: '2026-01-01', casos, ...extra },
    metricas: { duracaoMs: 60000, custoUsd: 1.5, tokensEntrada: 100, tokensSaida: 20 },
  };
}

const caso = (id, veredicto, evidencia = []) => ({
  id,
  veredicto,
  esperado: 'e',
  observado: 'o',
  evidencia,
});

describe('contarVeredictos', () => {
  it('conta os quatro veredictos e o total', () => {
    const contagens = contarVeredictos([
      caso('CT-01', 'passa'),
      caso('CT-02', 'falha'),
      caso('CT-03', 'bloqueado'),
      caso('CT-04', 'nao_aplicavel'),
      caso('CT-05', 'passa'),
    ]);
    expect(contagens).toEqual({ passa: 2, falha: 1, bloqueado: 1, nao_aplicavel: 1, total: 5 });
  });

  it('devolve tudo a zero sem casos', () => {
    expect(contarVeredictos([])).toEqual({
      passa: 0,
      falha: 0,
      bloqueado: 0,
      nao_aplicavel: 0,
      total: 0,
    });
  });
});

describe('recolherSessao', () => {
  it('lê a pasta e não o sessao.json — um sessao.json incompleto não esconde documentos', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__um', documento([caso('CT-01', 'passa')]));
    escreverDocumento(raiz, 's', 's__dois', documento([caso('CT-01', 'falha')]));
    // Declara só um dos dois, como o de 2026-08-18.
    writeFileSync(
      join(raiz, 's', 'sessao.json'),
      JSON.stringify({ estado: 'concluida', documentos: [{ documento: 's__um' }] }),
      'utf8',
    );

    const sessao = recolherSessao(raiz, 's');
    // Por ordem alfabética da pasta, para o relatório sair igual em duas gerações seguidas.
    expect(sessao.documentos.map((d) => d.id)).toEqual(['s__dois', 's__um']);
    expect(sessao.contagens.total).toBe(2);
  });

  it('tira do sessao.json apenas estado, razão e porCorrer', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__um', documento([caso('CT-01', 'passa')]));
    writeFileSync(
      join(raiz, 's', 'sessao.json'),
      JSON.stringify({ estado: 'pausada', razao: 'máquina desligada', porCorrer: ['a', 'b'] }),
      'utf8',
    );

    const sessao = recolherSessao(raiz, 's');
    expect(sessao.estado).toBe('pausada');
    expect(sessao.razao).toBe('máquina desligada');
    expect(sessao.porCorrer).toEqual(['a', 'b']);
  });

  it('sobrevive à ausência de sessao.json', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__um', documento([caso('CT-01', 'passa')]));
    const sessao = recolherSessao(raiz, 's');
    expect(sessao.estado).toBeNull();
    expect(sessao.documentos).toHaveLength(1);
  });

  it('descarta a evidência que não existe em disco e mantém a que existe', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(
      raiz,
      's',
      's__um',
      documento([caso('CT-01', 'falha', ['existe.png', 'fantasma.png'])]),
      ['existe.png'],
    );

    const [doc] = recolherSessao(raiz, 's').documentos;
    expect(doc.casos[0].evidencia).toEqual(['s__um/existe.png']);
  });

  it('classifica como bloqueado um veredicto fora do vocabulário, em vez de o perder', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__um', documento([caso('CT-01', 'talvez')]));
    const [doc] = recolherSessao(raiz, 's').documentos;
    expect(doc.casos[0].veredicto).toBe('bloqueado');
    expect(doc.contagens.bloqueado).toBe(1);
  });

  it('ignora o documento com resultado.json truncado sem derrubar os outros', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__bom', documento([caso('CT-01', 'passa')]));
    const mau = join(raiz, 's', 's__mau');
    mkdirSync(mau, { recursive: true });
    writeFileSync(join(mau, 'resultado.json'), '{"resposta": {"cas', 'utf8');

    const sessao = recolherSessao(raiz, 's');
    expect(sessao.documentos.map((d) => d.id)).toEqual(['s__bom']);
  });

  it('ignora a pasta sem resultado.json', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(raiz, 's', 's__bom', documento([caso('CT-01', 'passa')]));
    mkdirSync(join(raiz, 's', 's__vazio'), { recursive: true });
    expect(recolherSessao(raiz, 's').documentos).toHaveLength(1);
  });
});

describe('recolherDia', () => {
  it('soma contagens e métricas de todas as sessões', () => {
    const raiz = corridaTemporaria();
    const data = join(raiz, '2026-01-01');
    escreverDocumento(data, 'a', 'a__um', documento([caso('CT-01', 'passa')]));
    escreverDocumento(data, 'b', 'b__um', documento([caso('CT-01', 'falha'), caso('CT-02', 'passa')]));

    const modelo = recolherDia(raiz, '2026-01-01');
    expect(modelo.sessoes.map((s) => s.id)).toEqual(['a', 'b']);
    expect(modelo.contagens).toEqual({
      passa: 2,
      falha: 1,
      bloqueado: 0,
      nao_aplicavel: 0,
      total: 3,
    });
    expect(modelo.metricas.custoUsd).toBeCloseTo(3);
    expect(modelo.metricas.duracaoMs).toBe(120000);
  });

  it('usa o título da sessão quando o há', () => {
    const raiz = corridaTemporaria();
    escreverDocumento(join(raiz, '2026-01-01'), 'a', 'a__um', documento([caso('CT-01', 'passa')]));
    const titulos = new Map([['a', { titulo: 'Sessão A' }]]);
    expect(recolherDia(raiz, '2026-01-01', titulos).sessoes[0].titulo).toBe('Sessão A');
  });

  it('explica-se quando a data não existe', () => {
    expect(() => recolherDia(corridaTemporaria(), '1999-01-01')).toThrow(/não existe corrida/);
  });
});
