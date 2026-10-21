import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapearSessao, escreverProgresso } from '../src/mapear-sessao.mjs';

const resultado = (custoUsd, extra = {}) => ({
  estado: 'concluido',
  caminho: 'mapas/s/d.yaml',
  resposta: { accoes: [{ id: 'A01' }], casos_sem_accao: ['CT-05'] },
  metricas: { custoUsd },
  avisos: [],
  alvosRepescados: 2,
  ...extra,
});

describe('mapearSessao', () => {
  it('mapeia os documentos em série e resume custo e ações', async () => {
    const resumo = await mapearSessao(
      { sessao: 'gestao-armazem', documentos: ['a.md', 'b.md'] },
      { mapear: async () => resultado(4) },
    );
    expect(resumo.custoUsd).toBe(8);
    expect(resumo.documentos.map((d) => d.documento)).toEqual(['a.md', 'b.md']);
    expect(resumo.documentos[0].accoes).toBe(1);
    expect(resumo.documentos[0].casos_sem_accao).toEqual(['CT-05']);
    expect(resumo.documentos[0].repescados).toBe(2);
  });

  it('publica o progresso depois de CADA documento, não só no fim', async () => {
    // A corrida de 19/08 andou duas horas sem forma de saber quanto já se tinha gasto: o
    // resumo só saía no fim. O progresso tem de ser legível a meio, e a meio de uma corrida
    // que ainda vai a caminho.
    const publicados = [];
    await mapearSessao(
      { sessao: 's', documentos: ['a.md', 'b.md', 'c.md'] },
      { mapear: async () => resultado(3), publicar: (p) => publicados.push(structuredClone(p)) },
    );
    expect(publicados).toHaveLength(3);
    expect(publicados.map((p) => p.documentos.length)).toEqual([1, 2, 3]);
    expect(publicados.map((p) => p.custoUsd)).toEqual([3, 6, 9]);
  });

  it('diz no progresso quantos faltam, para se poder extrapolar o custo por correr', async () => {
    const publicados = [];
    await mapearSessao(
      { sessao: 's', documentos: ['a.md', 'b.md', 'c.md'] },
      { mapear: async () => resultado(3), publicar: (p) => publicados.push(structuredClone(p)) },
    );
    expect(publicados[0].por_correr).toEqual(['b.md', 'c.md']);
    expect(publicados[0].estado).toBe('a_correr');
    expect(publicados.at(-1).por_correr).toEqual([]);
    expect(publicados.at(-1).estado).toBe('concluida');
  });

  it('um documento que rebenta entra no progresso e não trava os seguintes', async () => {
    const publicados = [];
    const resumo = await mapearSessao(
      { sessao: 's', documentos: ['a.md', 'b.md'] },
      {
        mapear: async (documento) => (documento === 'a.md'
          ? { estado: 'erro', avisos: ['rebentou'], metricas: { custoUsd: 1 }, resposta: null }
          : resultado(2)),
        publicar: (p) => publicados.push(structuredClone(p)),
      },
    );
    expect(resumo.documentos.map((d) => d.estado)).toEqual(['erro', 'concluido']);
    expect(resumo.custoUsd).toBe(3);
    expect(publicados[0].documentos[0].avisos).toEqual(['rebentou']);
  });

  it('conta o custo mesmo do documento que rebentou — pagou-se à mesma', async () => {
    const resumo = await mapearSessao(
      { sessao: 's', documentos: ['a.md'] },
      { mapear: async () => ({ estado: 'erro', avisos: [], metricas: { custoUsd: 5 }, resposta: null }) },
    );
    expect(resumo.custoUsd).toBe(5);
  });

  it('aguenta um documento sem métricas nenhumas', async () => {
    const resumo = await mapearSessao(
      { sessao: 's', documentos: ['a.md'] },
      { mapear: async () => ({ estado: 'erro', avisos: [], metricas: null, resposta: null }) },
    );
    expect(resumo.custoUsd).toBe(0);
    expect(resumo.documentos[0].custoUsd).toBeNull();
  });
});

describe('escreverProgresso', () => {
  it('escreve o ficheiro e sobrepõe-se à escrita anterior', () => {
    const dir = mkdtempSync(join(tmpdir(), 'progresso-'));
    try {
      const caminho = join(dir, 'mapeamento.json');
      escreverProgresso(caminho, { custoUsd: 1 });
      escreverProgresso(caminho, { custoUsd: 2 });
      expect(JSON.parse(readFileSync(caminho, 'utf8')).custoUsd).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cria a pasta se ainda não existir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'progresso-'));
    try {
      const caminho = join(dir, 'nova', 'mapeamento.json');
      escreverProgresso(caminho, { custoUsd: 1 });
      expect(existsSync(caminho)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
