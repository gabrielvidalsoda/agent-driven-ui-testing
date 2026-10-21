import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarInsumos } from '../src/insumos.mjs';
import { sincronizarFontes, versoesParaRegisto } from '../src/insumos-sincronizar.mjs';

function configDe(texto) {
  const dir = mkdtempSync(join(tmpdir(), 'sinc-'));
  const caminho = join(dir, 'insumos.yaml');
  writeFileSync(caminho, texto, 'utf8');
  return { insumos: carregarInsumos(caminho) };
}

const UMA_FONTE = `
fontes:
  docs: { tipo: git, url: https://exemplo/docs.git, ramo: main }
`;

function gitFalso({ sha = 'e115218aaa', falha = null } = {}) {
  return (args) => {
    if (falha && !args.includes('rev-parse')) return { codigo: 128, saida: falha };
    if (args.includes('rev-parse')) return { codigo: 0, saida: `${sha}\n` };
    return { codigo: 0, saida: '' };
  };
}

describe('sincronizarFontes', () => {
  it('devolve as versoes de cada fonte', () => {
    const raizCache = mkdtempSync(join(tmpdir(), 'cache-'));
    const versoes = sincronizarFontes(configDe(UMA_FONTE), { raizCache, correr: gitFalso() });
    expect(versoes.get('docs').sha).toBe('e115218aaa');
  });

  it('nao faz nada quando nao ha fontes declaradas', () => {
    const config = configDe('');
    expect(sincronizarFontes(config, { raizCache: mkdtempSync(join(tmpdir(), 'c-')) }).size).toBe(0);
  });

  // Correr com um requisito de ontem e pior do que nao correr: os veredictos sairiam contra
  // uma especificacao que ja mudou e ninguem os saberia distinguir.
  it('rebenta e diz como correr sem rede quando a sincronizacao falha', () => {
    const raizCache = mkdtempSync(join(tmpdir(), 'cache-'));
    expect(() => sincronizarFontes(configDe(UMA_FONTE), {
      raizCache, correr: gitFalso({ falha: 'fatal: Authentication failed' }),
    })).toThrow(/Authentication failed[\s\S]*atualizar: false/);
  });
});

describe('versoesParaRegisto', () => {
  it('reduz as versoes ao que interessa gravar na corrida', () => {
    const raizCache = mkdtempSync(join(tmpdir(), 'cache-'));
    mkdirSync(join(raizCache, 'docs', '.git'), { recursive: true });
    const versoes = sincronizarFontes(configDe(UMA_FONTE), { raizCache, correr: gitFalso() });
    expect(versoesParaRegisto(versoes)).toEqual({
      docs: { ramo: 'main', sha: 'e115218aaa', url: 'https://exemplo/docs.git' },
    });
  });
});
