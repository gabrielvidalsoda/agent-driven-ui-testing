import { describe, it, expect } from 'vitest';
import { htmlSessao, htmlIndice } from '../src/relatorio/html.mjs';

const contagens = (p = 0, f = 0, b = 0, na = 0) => ({
  passa: p,
  falha: f,
  bloqueado: b,
  nao_aplicavel: na,
  total: p + f + b + na,
});

function documento(extra = {}) {
  return {
    id: 's__tela',
    documento: 'area/tela.md',
    estado: 'concluido',
    casos: [
      {
        id: 'CT-01',
        veredicto: 'passa',
        esperado: 'esperado um',
        observado: 'observado um',
        evidencia: [],
      },
    ],
    achados: [],
    registos: [],
    notasAmbiente: [],
    avisos: [],
    metricas: { custoUsd: 2 },
    contagens: contagens(1),
    ...extra,
  };
}

function sessao(extra = {}) {
  const documentos = extra.documentos ?? [documento()];
  return {
    id: 's',
    titulo: 'Sessão',
    estado: 'concluida',
    razao: null,
    porCorrer: [],
    documentos,
    contagens: contagens(1),
    metricas: { custoUsd: 2 },
    ...extra,
  };
}

describe('htmlSessao', () => {
  it('põe o «Resumo geral» como primeiro item da lista', () => {
    const html = htmlSessao(sessao(), '2026-01-01');
    const lista = html.slice(html.indexOf('class="lista"'), html.indexOf('</nav>'));
    expect(lista.indexOf('Resumo geral')).toBeLessThan(lista.indexOf('tela'));
  });

  it('dá uma página a cada tela, com esperado e observado', () => {
    const html = htmlSessao(sessao(), '2026-01-01');
    expect(html).toContain('id="p-s__tela"');
    expect(html).toContain('esperado um');
    expect(html).toContain('observado um');
  });

  it('mostra os quatro veredictos na legenda, nao_aplicavel à parte de bloqueado', () => {
    const html = htmlSessao(sessao(), '2026-01-01');
    expect(html).toContain('Não aplicável');
    expect(html).toContain('Bloqueado');
    // Cores distintas: a distinção que o gestor pediu não pode ser só de rótulo.
    expect(html).toContain('#5b6b7c');
    expect(html).toContain('#b7791f');
  });

  it('liga as capturas por caminho relativo, sem as embutir', () => {
    const doc = documento({
      casos: [
        {
          id: 'CT-02',
          veredicto: 'falha',
          esperado: 'e',
          observado: 'o',
          evidencia: ['s__tela/prova.png'],
        },
      ],
    });
    const html = htmlSessao(sessao({ documentos: [doc] }), '2026-01-01');
    expect(html).toContain('src="s__tela/prova.png"');
    expect(html).not.toContain('data:image');
  });

  it('anuncia o que ficou por correr quando a sessão foi pausada', () => {
    const html = htmlSessao(
      sessao({ estado: 'pausada', razao: 'máquina desligada', porCorrer: ['area/outra.md'] }),
      '2026-01-01',
    );
    expect(html).toContain('Por correr');
    expect(html).toContain('area/outra.md');
    expect(html).toContain('máquina desligada');
  });

  it('escapa marcação vinda do resultado, para o relatório não ser injectável', () => {
    const doc = documento({
      casos: [
        {
          id: 'CT-03',
          veredicto: 'falha',
          esperado: '<script>alert(1)</script>',
          observado: 'a & b',
          evidencia: [],
        },
      ],
    });
    const html = htmlSessao(sessao({ documentos: [doc] }), '2026-01-01');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('não usa CDN nenhum', () => {
    const html = htmlSessao(sessao(), '2026-01-01');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('aguenta uma sessão sem telas', () => {
    const html = htmlSessao(
      sessao({ documentos: [], contagens: contagens() }),
      '2026-01-01',
    );
    expect(html).toContain('Sem telas nesta sessão');
  });
});

describe('htmlIndice', () => {
  const modelo = {
    data: '2026-01-01',
    sessoes: [sessao(), sessao({ id: 'outra', titulo: 'Outra' })],
    contagens: contagens(2),
    metricas: { custoUsd: 4 },
  };

  it('dá uma linha por sessão, com link para o relatório dela', () => {
    const html = htmlIndice(modelo);
    expect(html).toContain('href="s/relatorio.html"');
    expect(html).toContain('href="outra/relatorio.html"');
  });

  it('mostra o total do dia', () => {
    expect(htmlIndice(modelo)).toContain('>2<'); // 2 sessões
    expect(htmlIndice(modelo)).toContain('$4.00');
  });

  it('aguenta um dia sem sessões', () => {
    const html = htmlIndice({
      data: '2026-01-01',
      sessoes: [],
      contagens: contagens(),
      metricas: {},
    });
    expect(html).toContain('Sem sessões nesta data');
  });
});

describe('ligação nos dois sentidos', () => {
  it('o relatório de sessão volta ao índice do dia', () => {
    expect(htmlSessao(sessao(), '2026-01-01')).toContain('href="../index.html"');
  });
});
