import { describe, it, expect } from 'vitest';
import { pareceId, padraoDeRota, dePara, tabelaMarkdown, sugestaoAlvos } from '../src/de-para.mjs';
import { montarDocumento } from '../src/cli/de-para.mjs';
import { validar } from '../src/esquema.mjs';

const BASE = 'https://hom.exemplo.com.br';

describe('pareceId', () => {
  it('reconhece as formas em que um id aparece num url', () => {
    expect(pareceId('123')).toBe(true);
    expect(pareceId('9f3a1b2c-4d5e-6f70-8912-a3b4c5d6e7f8')).toBe(true);
    expect(pareceId('a1b2c3d4e5f6')).toBe(true);
    expect(pareceId('cm3x9k2p0001abcd')).toBe(true);
  });

  // Um segmento de rota a mais tratado como id daria uma sugestao com :id onde ela e estavel,
  // e o de-para perdia justamente o que tem de valor.
  it('não confunde um segmento de rota com um id', () => {
    expect(pareceId('projects')).toBe(false);
    expect(pareceId('settings')).toBe(false);
    expect(pareceId('registo-entrada')).toBe(false);
    expect(pareceId('v2')).toBe(false);
  });
});

describe('padraoDeRota', () => {
  it('tira a base_url e devolve a rota relativa', () => {
    expect(padraoDeRota(`${BASE}/settings`, BASE)).toEqual({ rota: 'settings', parametrizada: false });
  });

  it('troca por :id os segmentos que identificam um registo', () => {
    expect(padraoDeRota(`${BASE}/projects/4821/pendencies`, BASE))
      .toEqual({ rota: 'projects/:id/pendencies', parametrizada: true });
  });

  // A query e estado de filtro: muda a cada pesquisa e nao faz parte do endereco da tela.
  it('deita fora a query e o fragmento', () => {
    expect(padraoDeRota(`${BASE}/projects?tab=inbox&pagina=2#topo`, BASE).rota).toBe('projects');
  });

  it('aguenta um url de outro domínio que a base não prefixa', () => {
    expect(padraoDeRota('https://outro.exemplo/settings/company', BASE).rota).toBe('settings/company');
  });

  it('a própria base_url dá rota vazia', () => {
    expect(padraoDeRota(`${BASE}/`, BASE)).toEqual({ rota: '', parametrizada: false });
  });
});

const DOCUMENTOS = [
  {
    documento: '11-gestao-de-pendencias.md',
    sessao: 'qualidade',
    telasVisitadas: [
      { nome: 'Pendências', url: `${BASE}/projects/4821/pendencies`, navegacao: 'menu → Projetos → abrir projeto → aba Pendências' },
      { nome: 'Detalhe da pendência', url: `${BASE}/projects/4821/pendencies/77` },
    ],
  },
  {
    documento: '12-administracao-e-perfis.md',
    sessao: 'administracao',
    telasVisitadas: [{ nome: 'Configurações da empresa', url: `${BASE}/settings` }],
  },
  { documento: '09-exportacao.md', sessao: 'analise', telasVisitadas: [] },
];

describe('dePara', () => {
  it('dá uma linha por tela visitada, com a rota em padrão', () => {
    const linhas = dePara(DOCUMENTOS, BASE);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ rota: 'projects/:id/pendencies', parametrizada: true, entrada: true });
    expect(linhas[1]).toMatchObject({ entrada: false });
    expect(linhas[2]).toMatchObject({ rota: 'settings', parametrizada: false, entrada: true });
  });

  it('um documento que não registou telas não dá linha nenhuma', () => {
    expect(dePara(DOCUMENTOS, BASE).some((l) => l.documento === '09-exportacao.md')).toBe(false);
  });
});

describe('sugestaoAlvos', () => {
  const yaml = sugestaoAlvos(dePara(DOCUMENTOS, BASE));

  it('propõe rota direta quando a tela não leva id', () => {
    expect(yaml).toContain('12-administracao-e-perfis.md:\n    rota: settings');
  });

  // Escrever `rota: projects/:id/pendencies` daria um url que nao abre: o id e massa de teste.
  it('mantém a navegação onde o url leva um id', () => {
    expect(yaml).toContain('navegacao: menu → Projetos → abrir projeto → aba Pendências');
    expect(yaml).not.toMatch(/rota: projects/);
  });

  it('só propõe a tela de entrada de cada documento', () => {
    expect(yaml).not.toContain('Detalhe da pendência');
  });
});

describe('documento gerado', () => {
  const md = montarDocumento({ data: '2026-09-05', linhas: dePara(DOCUMENTOS, BASE), baseUrl: BASE });

  it('conta quantas telas ficaram com rota direta', () => {
    expect(md).toContain('**1** com rota direta');
  });

  it('leva a tabela e o bloco para o alvos.yaml', () => {
    expect(md).toContain('| Documento | Tela |');
    expect(md).toContain('```yaml');
  });

  it('diz em voz alta que não escreveu no alvos.yaml', () => {
    expect(md).toMatch(/Não foi escrito\s+automaticamente/);
  });
});

describe('tabelaMarkdown', () => {
  it('sem telas registadas diz isso em vez de dar uma tabela vazia', () => {
    expect(tabelaMarkdown([])).toMatch(/Nenhuma corrida registou/);
  });
});

describe('esquema', () => {
  it('aceita telas_visitadas na resposta do agente', () => {
    const resposta = {
      documento: 'a.md',
      estado: 'concluido',
      casos: [],
      achados: [],
      telas_visitadas: [{ nome: 'Pendências', url: `${BASE}/projects/1/pendencies`, navegacao: 'menu' }],
    };
    expect(validar(resposta).valido).toBe(true);
  });

  it('recusa uma tela sem url — sem ele não há de-para nenhum', () => {
    const resposta = {
      documento: 'a.md', estado: 'concluido', casos: [], achados: [],
      telas_visitadas: [{ nome: 'Pendências' }],
    };
    expect(validar(resposta).valido).toBe(false);
  });
});
