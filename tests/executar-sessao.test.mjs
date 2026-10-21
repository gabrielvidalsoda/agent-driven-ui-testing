import { describe, it, expect } from 'vitest';
import { executarSessao, CONCORRENCIA_OMISSAO } from '../src/executar-sessao.mjs';

// Agente falso: cada documento traz um guião de estados, um por tentativa. É o que permite
// desenvolver e testar a sessão sem lançar um agente a sério nem gastar dinheiro.
function agenteFalso(porDocumento) {
  const ordem = [];
  const tentativasPor = new Map();
  const correr = async (documento) => {
    ordem.push(documento);
    const n = (tentativasPor.get(documento) ?? 0) + 1;
    tentativasPor.set(documento, n);
    const guiao = porDocumento[documento] ?? ['concluido'];
    return {
      estado: guiao[Math.min(n - 1, guiao.length - 1)],
      metricas: { custoUsd: 1, duracaoMs: 10 },
    };
  };
  return { correr, ordem };
}

describe('executarSessao em série', () => {
  it('corre pela ordem dada', async () => {
    const falso = agenteFalso({});
    await executarSessao(
      { sessao: 'gestao-armazem', documentos: ['a.md', 'b.md', 'c.md'], paralelo: false },
      { correr: falso.correr },
    );
    expect(falso.ordem).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('um documento com erro não trava os seguintes', async () => {
    const falso = agenteFalso({ 'b.md': ['erro', 'erro'] });
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md', 'c.md'], paralelo: false, tentativas: 1 },
      { correr: falso.correr },
    );
    expect(r.documentos.map((d) => d.estado)).toEqual(['concluido', 'erro', 'concluido']);
  });

  it('repete o erro uma vez e aceita o segundo resultado', async () => {
    const falso = agenteFalso({ 'a.md': ['erro', 'concluido'] });
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md'], paralelo: false, tentativas: 2 },
      { correr: falso.correr },
    );
    expect(r.documentos[0]).toMatchObject({ estado: 'concluido', tentativas: 2 });
  });

  it('nunca repete uma falha de produto', async () => {
    const falso = agenteFalso({ 'a.md': ['bloqueado', 'concluido'] });
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md'], paralelo: false, tentativas: 2 },
      { correr: falso.correr },
    );
    expect(r.documentos[0]).toMatchObject({ estado: 'bloqueado', tentativas: 1 });
  });

  it('soma o custo e a duração da sessão', async () => {
    const falso = agenteFalso({});
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md'], paralelo: false },
      { correr: falso.correr },
    );
    expect(r.custoUsd).toBe(2);
    expect(r.duracaoMs).toBe(20);
  });
});

describe('executarSessao em paralelo', () => {
  it('lança os documentos ao mesmo tempo', async () => {
    let emVoo = 0;
    let maximo = 0;
    const correr = async () => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return { estado: 'concluido', metricas: { custoUsd: 0, duracaoMs: 5 } };
    };
    await executarSessao({ sessao: 'x', documentos: ['a.md', 'b.md', 'c.md'], paralelo: true }, { correr });
    expect(maximo).toBe(3);
  });

  it('devolve os resultados pela ordem dos documentos', async () => {
    const correr = async (documento) => {
      await new Promise((r) => setTimeout(r, documento === 'a.md' ? 15 : 1));
      return { estado: 'concluido', metricas: { custoUsd: 0, duracaoMs: 1 } };
    };
    const r = await executarSessao({ sessao: 'x', documentos: ['a.md', 'b.md'], paralelo: true }, { correr });
    expect(r.documentos.map((d) => d.documento)).toEqual(['a.md', 'b.md']);
  });

  it('respeita o limite de concorrência', async () => {
    let emVoo = 0;
    let maximo = 0;
    const correr = async () => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return { estado: 'concluido', metricas: { custoUsd: 0, duracaoMs: 5 } };
    };
    const documentos = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];
    const r = await executarSessao({ sessao: 'x', documentos, paralelo: true, concorrencia: 2 }, { correr });
    expect(maximo).toBe(2);
    expect(r.documentos).toHaveLength(5);
  });

  it('sem limite declarado não lança mais do que o limite por omissão', async () => {
    let emVoo = 0;
    let maximo = 0;
    const correr = async () => {
      emVoo += 1;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo -= 1;
      return { estado: 'concluido', metricas: { custoUsd: 0, duracaoMs: 5 } };
    };
    const documentos = Array.from({ length: 12 }, (_, i) => `d${i}.md`);
    await executarSessao({ sessao: 'x', documentos, paralelo: true }, { correr });
    expect(maximo).toBe(CONCORRENCIA_OMISSAO);
  });

  // Em paralelo a sonda era saltada: uma base que caísse a meio devolvia a sessão inteira em
  // bloqueios falsos, pagos ao mesmo preço dos bons.
  it('pára em infra também em paralelo, e diz o que ficou por correr', async () => {
    const falso = agenteFalso({});
    let chamadas = 0;
    const verificar = async () => {
      chamadas += 1;
      return chamadas <= 2 ? { ok: true } : { ok: false, razao: 'ORA-12516' };
    };
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md', 'c.md', 'd.md'], paralelo: true, concorrencia: 1 },
      { correr: falso.correr, verificar },
    );
    expect(r.estado).toBe('infra');
    expect(r.razao).toContain('ORA-12516');
    expect(r.documentos.map((d) => d.documento)).toEqual(['a.md', 'b.md']);
    expect(r.porCorrer).toEqual(['c.md', 'd.md']);
  });
});

describe('guarda de ambiente', () => {
  it('sem verificador, corre tudo como antes', async () => {
    const falso = agenteFalso({});
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md'], paralelo: false },
      { correr: falso.correr },
    );
    expect(r.estado).toBe('concluida');
    expect(r.documentos).toHaveLength(2);
  });

  it('pára em infra quando o ambiente cai a meio', async () => {
    const falso = agenteFalso({});
    let chamadas = 0;
    const verificar = async () => {
      chamadas += 1;
      return chamadas <= 2 ? { ok: true } : { ok: false, razao: 'a aplicação não respondeu em 20000ms' };
    };
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md', 'c.md', 'd.md'], paralelo: false },
      { correr: falso.correr, verificar },
    );
    expect(r.estado).toBe('infra');
    expect(r.razao).toContain('20000ms');
    expect(r.documentos.map((d) => d.documento)).toEqual(['a.md', 'b.md']);
    expect(r.porCorrer).toEqual(['c.md', 'd.md']);
  });

  it('não lança agente nenhum se o ambiente já estiver em baixo', async () => {
    const falso = agenteFalso({});
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md'], paralelo: false },
      { correr: falso.correr, verificar: async () => ({ ok: false, razao: 'ECONNREFUSED' }) },
    );
    expect(r.estado).toBe('infra');
    expect(falso.ordem).toEqual([]);
    expect(r.custoUsd).toBe(0);
  });

  it('guarda o custo do que chegou a correr antes da queda', async () => {
    const falso = agenteFalso({});
    let n = 0;
    const verificar = async () => (++n <= 1 ? { ok: true } : { ok: false, razao: 'caiu' });
    const r = await executarSessao(
      { sessao: 'x', documentos: ['a.md', 'b.md'], paralelo: false },
      { correr: falso.correr, verificar },
    );
    expect(r.custoUsd).toBe(1);
  });
});
