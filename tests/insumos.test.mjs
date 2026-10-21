import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarInsumos, partirRef, refsDe, lerInsumos } from '../src/insumos.mjs';

function ficheiroTemporario(conteudo, nome = 'insumos.yaml') {
  const dir = mkdtempSync(join(tmpdir(), 'insumos-'));
  const caminho = join(dir, nome);
  writeFileSync(caminho, conteudo, 'utf8');
  return caminho;
}

const YAML_BOM = `
cache: .insumos
atualizar: true

fontes:
  ccmsns-docs-code:
    tipo: git
    url: https://bitbucket.org/morpheustecnologia/ccmsns-docs-code.git
    ramo: main

comuns:
  - ccmsns-docs-code:docs/padroes/api-rest.md

por_documento:
  gestao-armazem/registo-entrada.md:
    - ccmsns-docs-code:docs/superpowers/specs/registo-entrada-design.md
`;

describe('carregarInsumos', () => {
  it('carrega as fontes, os comuns e os insumos por documento', () => {
    const config = carregarInsumos(ficheiroTemporario(YAML_BOM));
    expect(config.cache).toBe('.insumos');
    expect(config.atualizar).toBe(true);
    expect(config.fontes.get('ccmsns-docs-code')).toEqual({
      tipo: 'git',
      url: 'https://bitbucket.org/morpheustecnologia/ccmsns-docs-code.git',
      ramo: 'main',
    });
    expect(config.comuns).toEqual(['ccmsns-docs-code:docs/padroes/api-rest.md']);
    expect(config.porDocumento.get('gestao-armazem/registo-entrada.md'))
      .toEqual(['ccmsns-docs-code:docs/superpowers/specs/registo-entrada-design.md']);
  });

  it('assume main e o cache por omissao quando nao estao escritos', () => {
    const config = carregarInsumos(ficheiroTemporario(`
fontes:
  docs:
    tipo: git
    url: https://exemplo/docs.git
`));
    expect(config.fontes.get('docs').ramo).toBe('main');
    expect(config.cache).toBe('.insumos');
    expect(config.atualizar).toBe(true);
  });

  // Um ficheiro ausente nao e erro: a suite tem de continuar a correr sem insumos nenhuns,
  // como corria antes de eles existirem.
  it('devolve configuracao vazia quando o ficheiro nao existe', () => {
    const config = carregarInsumos(join(tmpdir(), 'nao-existe-insumos.yaml'));
    expect(config.fontes.size).toBe(0);
    expect(config.comuns).toEqual([]);
  });

  it('recusa uma fonte sem url', () => {
    expect(() => carregarInsumos(ficheiroTemporario(`
fontes:
  docs:
    tipo: git
`))).toThrow(/docs.*url/);
  });
});

describe('partirRef', () => {
  it('parte a referencia em fonte e caminho', () => {
    expect(partirRef('ccmsns-docs-code:docs/padroes/api-rest.md'))
      .toEqual({ fonte: 'ccmsns-docs-code', caminho: 'docs/padroes/api-rest.md' });
  });

  it('recusa uma referencia sem fonte', () => {
    expect(() => partirRef('docs/padroes/api-rest.md')).toThrow(/fonte:caminho/);
  });
});

describe('refsDe', () => {
  const config = carregarInsumos(ficheiroTemporario(YAML_BOM));

  it('junta os comuns aos do documento, os comuns primeiro', () => {
    expect(refsDe(config, 'gestao-armazem/registo-entrada.md')).toEqual([
      'ccmsns-docs-code:docs/padroes/api-rest.md',
      'ccmsns-docs-code:docs/superpowers/specs/registo-entrada-design.md',
    ]);
  });

  it('da so os comuns a um documento sem insumos proprios', () => {
    expect(refsDe(config, 'conferencia/log-conferencia.md'))
      .toEqual(['ccmsns-docs-code:docs/padroes/api-rest.md']);
  });

  // Um insumo repetido custaria tokens duas vezes e nao acrescenta nada ao enunciado.
  it('nao repete um insumo declarado nos comuns e no documento', () => {
    const config2 = carregarInsumos(ficheiroTemporario(`
fontes:
  d: { tipo: git, url: https://exemplo/d.git }
comuns:
  - d:a.md
por_documento:
  x.md:
    - d:a.md
    - d:b.md
`));
    expect(refsDe(config2, 'x.md')).toEqual(['d:a.md', 'd:b.md']);
  });
});

describe('lerInsumos', () => {
  function cacheCom(ficheiros) {
    const raiz = mkdtempSync(join(tmpdir(), 'cache-'));
    for (const [caminho, conteudo] of Object.entries(ficheiros)) {
      const destino = join(raiz, caminho);
      mkdirSync(join(destino, '..'), { recursive: true });
      writeFileSync(destino, conteudo, 'utf8');
    }
    return raiz;
  }

  it('le o texto de cada insumo do documento', () => {
    const config = carregarInsumos(ficheiroTemporario(YAML_BOM));
    const raizCache = cacheCom({
      'ccmsns-docs-code/docs/padroes/api-rest.md': '# API REST',
      'ccmsns-docs-code/docs/superpowers/specs/registo-entrada-design.md': '# Registo de entrada',
    });
    const insumos = lerInsumos(config, 'gestao-armazem/registo-entrada.md', { raizCache });
    expect(insumos.map((i) => i.texto)).toEqual(['# API REST', '# Registo de entrada']);
    expect(insumos[0].ref).toBe('ccmsns-docs-code:docs/padroes/api-rest.md');
  });

  // Um enunciado a que falta o requisito produz veredictos errados que se pagam na mesma:
  // e preferivel nao correr o documento.
  it('rebenta quando o ficheiro do insumo nao esta na cache', () => {
    const config = carregarInsumos(ficheiroTemporario(YAML_BOM));
    const raizCache = cacheCom({ 'ccmsns-docs-code/docs/padroes/api-rest.md': '# API REST' });
    expect(() => lerInsumos(config, 'gestao-armazem/registo-entrada.md', { raizCache }))
      .toThrow(/insumo em falta.*registo-entrada-design\.md/s);
  });

  it('rebenta quando a referencia aponta a uma fonte que nao existe', () => {
    const config = carregarInsumos(ficheiroTemporario(`
fontes:
  d: { tipo: git, url: https://exemplo/d.git }
por_documento:
  x.md: [outra:a.md]
`));
    expect(() => lerInsumos(config, 'x.md', { raizCache: cacheCom({}) }))
      .toThrow(/outra.*nao esta declarada/);
  });

  it('nao le nada para um documento sem insumos nenhuns', () => {
    const config = carregarInsumos(join(tmpdir(), 'nao-existe-insumos.yaml'));
    expect(lerInsumos(config, 'x.md', { raizCache: cacheCom({}) })).toEqual([]);
  });
});
