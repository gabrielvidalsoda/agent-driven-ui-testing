import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarAlvos, alvoDe, urlDe, rotasDoRouter, esbocarAlvos, documentosIncompletos } from '../src/alvos.mjs';

function ficheiroTemporario(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'alvos-'));
  const caminho = join(dir, 'alvos.yaml');
  writeFileSync(caminho, conteudo, 'utf8');
  return caminho;
}

const YAML_BOM = `
documentos:
  consulta-area-prestacao/medicamentos-prestacoes.md:
    rota: /medicamentos/prestacoes
    sessao: consulta-area-prestacao
    escrita: true
  gestao-armazem/registo-entrada.md:
    rota: /armazem/registo-entrada
    sessao: gestao-armazem
    escrita: true
`;

describe('carregarAlvos', () => {
  it('carrega os documentos com rota, sessao e escrita', () => {
    const mapa = carregarAlvos(ficheiroTemporario(YAML_BOM));
    expect(mapa.size).toBe(2);
    expect(mapa.get('gestao-armazem/registo-entrada.md')).toEqual({
      rota: '/armazem/registo-entrada', sessao: 'gestao-armazem', escrita: true,
    });
  });

  // Carregar é preguiçoso de propósito: com 65 rotas por preencher, uma validação ansiosa
  // impediria de correr até o documento de calibração, que tem a rota preenchida.
  it('carrega mesmo com documentos por preencher', () => {
    const meio = `documentos:
  a/pronto.md:
    rota: a/pronto
    sessao: a
    escrita: false
  b/porfazer.md:
    rota: POR_PREENCHER
    sessao: b
    escrita: false
`;
    const mapa = carregarAlvos(ficheiroTemporario(meio));
    expect(mapa.size).toBe(2);
    expect(mapa.get('a/pronto.md').rota).toBe('a/pronto');
  });
});

describe('alvoDe', () => {
  it('lança quando o documento não está no mapa', () => {
    const mapa = carregarAlvos(ficheiroTemporario(YAML_BOM));
    expect(() => alvoDe(mapa, 'nao/existe.md')).toThrow(/nao\/existe\.md/);
  });

  it('lança só quando é o documento pedido que não tem rota', () => {
    const meio = 'documentos:\n  a/pronto.md:\n    rota: a/pronto\n    sessao: a\n  b/porfazer.md:\n    rota: POR_PREENCHER\n    sessao: b\n';
    const mapa = carregarAlvos(ficheiroTemporario(meio));
    expect(alvoDe(mapa, 'a/pronto.md').rota).toBe('a/pronto');
    expect(() => alvoDe(mapa, 'b/porfazer.md')).toThrow(/b\/porfazer\.md.*rota/);
  });
});

describe('documentosIncompletos', () => {
  it('lista os documentos sem rota, para verificar antes de uma corrida completa', () => {
    const meio = 'documentos:\n  a/pronto.md:\n    rota: a/pronto\n    sessao: a\n  b/porfazer.md:\n    rota: POR_PREENCHER\n    sessao: b\n';
    const mapa = carregarAlvos(ficheiroTemporario(meio));
    expect(documentosIncompletos(mapa)).toEqual(['b/porfazer.md']);
  });
});

describe('urlDe', () => {
  it('junta base e rota sem duplicar a barra', () => {
    expect(urlDe('http://localhost:4174/', { rota: '/medicamentos/prestacoes' }))
      .toBe('http://localhost:4174/medicamentos/prestacoes');
    expect(urlDe('http://localhost:4174', { rota: '/medicamentos/prestacoes' }))
      .toBe('http://localhost:4174/medicamentos/prestacoes');
  });

  // O routes.tsx do ccmsns-ui declara as 121 rotas como filhas, sem barra inicial.
  it('aceita a rota relativa, como o router a escreve', () => {
    expect(urlDe('http://localhost:4174', { rota: 'medicamentos/prestacoes' }))
      .toBe('http://localhost:4174/medicamentos/prestacoes');
  });
});

describe('rotasDoRouter', () => {
  it('extrai os paths do routes.tsx', () => {
    const tsx = `
      const rotas = [
        { path: '/medicamentos/prestacoes', element: <A /> },
        { path: "/armazem/registo-entrada", element: <B /> },
      ];`;
    expect(rotasDoRouter(tsx)).toEqual(['/medicamentos/prestacoes', '/armazem/registo-entrada']);
  });
});

describe('esbocarAlvos', () => {
  it('deixa a rota por preencher quando não há palpite', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'gestao-armazem/registo-entrada.md', sessao: 'gestao-armazem', escrita: true }],
      ['/medicamentos/prestacoes'],
    );
    expect(yaml).toMatch(/rota: POR_PREENCHER/);
    expect(yaml).toMatch(/sessao: gestao-armazem/);
  });

  it('sugere a rota quando o nome do documento casa com um path', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/medicamentos-prestacoes.md', sessao: 'x', escrita: false }],
      ['/medicamentos/prestacoes'],
    );
    expect(yaml).toMatch(/rota: \/medicamentos\/prestacoes/);
  });

  // Uma rota com :id nao e navegavel sem um valor concreto, que e massa e nao configuracao.
  it('nunca sugere uma rota com parametros', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/medicamentos-prestacoes.md', sessao: 'x', escrita: false }],
      ['medicamentos/prestacoes/:id'],
    );
    expect(yaml).toMatch(/rota: POR_PREENCHER/);
  });

  // Uma sugestao errada e pior do que um branco: quem revê corrige os brancos e confia nos
  // preenchidos. `uts-prestacoes` nao e a tela `saude-oral/prestacoes`.
  it('nao sugere uma rota so porque ela contem as palavras', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/uts-prestacoes.md', sessao: 'x', escrita: false }],
      ['saude-oral/prestacoes'],
    );
    expect(yaml).toMatch(/rota: POR_PREENCHER/);
  });

  it('casa quando os segmentos da rota sao exatamente os do nome', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/saude-oral-prestacoes.md', sessao: 'x', escrita: false }],
      ['saude-oral/prestacoes'],
    );
    expect(yaml).toMatch(/rota: saude-oral\/prestacoes/);
  });

  // `conferencia/cockpit.md` casa com a rota `conferencia/cockpit` quando se conta a pasta.
  it('casa tambem quando a pasta do documento faz parte da rota', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'conferencia/cockpit.md', sessao: 'conferencia', escrita: true }],
      ['conferencia/cockpit', 'conferencia/cockpit/disparar'],
    );
    expect(yaml).toMatch(/rota: conferencia\/cockpit\n/);
  });

  it('lista candidatas para quem preenche a mao, sem as promover a rota', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/uts-prestacoes.md', sessao: 'x', escrita: false }],
      ['saude-oral/prestacoes', 'uts/factura', 'motor-regras'],
    );
    expect(yaml).toMatch(/rota: POR_PREENCHER/);
    expect(yaml).toMatch(/candidatas:/);
    expect(yaml).toMatch(/uts\/factura/);
    expect(yaml).not.toMatch(/motor-regras/);
  });

  it('nao mete candidatas quando a rota ficou resolvida', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/medicamentos-prestacoes.md', sessao: 'x', escrita: false }],
      ['medicamentos/prestacoes'],
    );
    expect(yaml).not.toMatch(/candidatas:/);
  });

  it('prefere a rota mais curta quando varias casam', () => {
    const yaml = esbocarAlvos(
      [{ documento: 'x/medicamentos-prestacoes.md', sessao: 'x', escrita: false }],
      ['medicamentos/prestacoes/erros', 'medicamentos/prestacoes'],
    );
    expect(yaml).toMatch(/rota: medicamentos\/prestacoes\n/);
  });
});

describe('nivel por documento', () => {
  it('le o nivel quando esta escrito', () => {
    const mapa = carregarAlvos(ficheiroTemporario(`
documentos:
  a/b.md:
    rota: a/b
    sessao: a
    escrita: false
    nivel: 1
`));
    expect(mapa.get('a/b.md').nivel).toBe(1);
  });

  it('deixa o nivel indefinido quando nao esta escrito, para o global mandar', () => {
    const mapa = carregarAlvos(ficheiroTemporario(`
documentos:
  a/b.md:
    rota: a/b
    sessao: a
    escrita: false
`));
    expect(mapa.get('a/b.md').nivel).toBeUndefined();
  });
});

// Nem toda a aplicacao tem rota estavel para cada tela: ha ecras que so se alcancam por dentro
// de outro, e cujo url leva um id que e massa de teste e nao configuracao.
describe('alvos sem rota, com navegação', () => {
  const SO_NAVEGACAO = `
documentos:
  produto/pendencias.md:
    sessao: produto
    navegacao: menu lateral → Projetos → abrir um projeto → aba Pendências
  produto/orfao.md:
    sessao: produto
`;

  it('um alvo com navegação e sem rota corre à mesma', () => {
    const mapa = carregarAlvos(ficheiroTemporario(SO_NAVEGACAO));
    expect(() => alvoDe(mapa, 'produto/pendencias.md')).not.toThrow();
    expect(documentosIncompletos(mapa)).toEqual(['produto/orfao.md']);
  });

  it('sem rota, o ponto de partida é a própria base_url', () => {
    const mapa = carregarAlvos(ficheiroTemporario(SO_NAVEGACAO));
    expect(urlDe('https://hom.exemplo/', mapa.get('produto/pendencias.md'))).toBe('https://hom.exemplo');
  });

  it('sem rota e sem navegação continua a ser erro', () => {
    const mapa = carregarAlvos(ficheiroTemporario(SO_NAVEGACAO));
    expect(() => alvoDe(mapa, 'produto/orfao.md')).toThrow(/falta a rota ou a navegação/);
  });
});
