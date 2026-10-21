import { describe, it, expect } from 'vitest';
import { montarEnunciado } from '../src/enunciado.mjs';

const MAPA = {
  documento: 'gestao-armazem/registo-entrada.md',
  rota: 'armazem/registo-entrada',
  mapeado_em: '2026-08-19',
  accoes: [
    { id: 'A01', tipo: 'consulta', nome: 'Pesquisar por ciclo', como: 'preencher Ciclo',
      promessa: 'grelha com os registos', casos_documento: ['CT-01'] },
    { id: 'A02', tipo: 'criacao', nome: 'Criar ciclo', como: 'botao Novo Ciclo',
      promessa: 'o ciclo aparece na lista', casos_documento: [] },
  ],
  insumos_necessarios: [{ descricao: 'ciclo por usar', obtivel: 'tela' }],
  casos_sem_accao: ['CT-05'],
};

const ARGS = {
  documento: 'consulta-area-prestacao/medicamentos-prestacoes.md',
  texto: '## 5. Massa\nFactura E017-1, NIF 501137688\n### CT-01\n14 prestações',
  url: 'http://localhost:4174/medicamentos/prestacoes',
  pastaEvidencias: 'C:/corridas/2026-08-17/medicamentos-prestacoes',
  marcador: 'AGENTE-2026-08-18',
  mapa: MAPA,
  nivel: 2,
};

describe('montarEnunciado', () => {
  it('inclui o texto do documento e o url', () => {
    const e = montarEnunciado(ARGS);
    expect(e).toContain('Factura E017-1');
    expect(e).toContain('http://localhost:4174/medicamentos/prestacoes');
  });

  it('proíbe inventar massa', () => {
    expect(montarEnunciado(ARGS)).toMatch(/nunca invent/i);
  });

  it('exige evidência para uma falha', () => {
    expect(montarEnunciado(ARGS)).toMatch(/falha.*captura|captura.*falha/is);
  });

  it('apresenta bloqueado como veredicto legítimo', () => {
    expect(montarEnunciado(ARGS)).toContain('bloqueado');
  });

  it('diz onde gravar as evidências', () => {
    expect(montarEnunciado(ARGS)).toContain('C:/corridas/2026-08-17/medicamentos-prestacoes');
  });

  it('inclui o esquema da resposta', () => {
    expect(montarEnunciado(ARGS)).toContain('notas_ambiente');
  });
});

describe('política de escrita', () => {
  it('manda escrever só sobre registos criados pelo próprio agente', () => {
    expect(montarEnunciado(ARGS)).toMatch(/só sobre registos que tu criaste/i);
  });

  it('proíbe alterar ou apagar massa pré-existente', () => {
    expect(montarEnunciado(ARGS)).toMatch(/nunca alteres nem apagues um registo que já lá estava/i);
  });

  it('leva o marcador que identifica o que foi criado', () => {
    expect(montarEnunciado(ARGS)).toContain('AGENTE-2026-08-18');
  });

  it('manda apagar tudo no fim e prestar contas', () => {
    const e = montarEnunciado(ARGS);
    expect(e).toMatch(/apaga tudo o que criaste/i);
    expect(e).toContain('registos_criados');
  });

  it('faz a política ganhar ao documento de cenários', () => {
    expect(montarEnunciado(ARGS)).toMatch(/ganha a qualquer instrução em contrário/i);
  });

  // Um documento nomeia registos concretos para o testador remover. Sem esta instrução o
  // agente obedecia ao documento e apagava massa histórica de uma base partilhada.
  it('manda exercer a remoção sobre um registo criado por ele, e não sobre o que o documento nomeia', () => {
    expect(montarEnunciado(ARGS)).toMatch(/confirmar a remoção de um registo concreto.*equivalente criado por ti/s);
  });
});

describe('mapa no enunciado', () => {
  const enunciado = montarEnunciado({ ...ARGS, comandoBd: 'bash /r/scripts/bd.sh' });

  it('lista as accoes do mapa como ambito', () => {
    expect(enunciado).toContain('A01');
    expect(enunciado).toContain('Pesquisar por ciclo');
    expect(enunciado).toContain('A02');
  });

  it('manda usar o CT-nn onde existe e a promessa onde nao existe', () => {
    expect(enunciado).toMatch(/CT-01/);
    expect(enunciado).toMatch(/promessa/i);
  });

  it('manda dar nao_aplicavel aos casos sem accao', () => {
    expect(enunciado).toMatch(/CT-05/);
    expect(enunciado).toMatch(/nao_aplicavel/);
  });

  it('faz o documento mandar no esperado dos casos que ele cobre', () => {
    expect(enunciado).toMatch(/o documento manda no esperado/i);
  });

  it('nao fala de casos sem accao quando o mapa nao tem nenhum', () => {
    const { casos_sem_accao, ...semLista } = MAPA;
    const e = montarEnunciado({ ...ARGS, mapa: semLista });
    expect(e).not.toMatch(/NÃO TÊM AÇÃO NA TELA/);
  });
});

describe('base de dados no enunciado', () => {
  const com = montarEnunciado({ ...ARGS, comandoBd: 'bash /r/scripts/bd.sh' });

  it('oferece o runner quando ha comandoBd', () => {
    expect(com).toContain('bash /r/scripts/bd.sh consultar');
    expect(com).toContain('bash /r/scripts/bd.sh escrever');
    expect(com).toMatch(/CONSULTAR É LIVRE/);
  });

  it('nao fala de base de dados quando nao ha runner', () => {
    expect(montarEnunciado(ARGS)).not.toMatch(/bd\.sh/);
  });

  it('diz que um valor lido da base nao e massa inventada', () => {
    expect(com).toMatch(/lido da\s+base é massa real e NÃO É INVENTADO/);
  });

  it('exige o sql na evidencia', () => {
    expect(com).toMatch(/EVIDÊNCIA OBRIGATÓRIA/);
    expect(com).toMatch(/SQL literal/);
  });
});

describe('nivel no enunciado', () => {
  it('o nivel 1 pede sugestoes de melhoria', () => {
    expect(montarEnunciado({ ...ARGS, nivel: 1 })).toMatch(/DÁS TAMBÉM SUGESTÕES DE MELHORIA/);
  });

  it('o nivel 2 proibe sugestoes de melhoria', () => {
    expect(montarEnunciado({ ...ARGS, nivel: 2 })).toMatch(/NÃO DÊS SUGESTÕES DE MELHORIA/);
  });

  it('o nivel 3 restringe a funcionalidade severa', () => {
    expect(montarEnunciado({ ...ARGS, nivel: 3 })).toMatch(/APENAS funcionalidade de gravidade severa/);
  });

  it('anuncia o nivel em que corre', () => {
    expect(montarEnunciado({ ...ARGS, nivel: 3 })).toMatch(/NÍVEL DE DETALHE: 3/);
  });

  it('manda classificar cada caso e cada achado', () => {
    const e = montarEnunciado(ARGS);
    expect(e).toMatch(/categoria/);
    expect(e).toMatch(/gravidade/);
  });
});

// Corrida sem mapa: o âmbito deixa de vir de um levantamento pago à parte e passa a ser o
// documento de cenários mais o requisito técnico, com o agente a percorrer a tela ele próprio.
describe('montarEnunciado sem mapa', () => {
  const SEM_MAPA = { ...ARGS, mapa: null };

  it('não fala de mapa nem de ações levantadas', () => {
    const e = montarEnunciado(SEM_MAPA);
    expect(e).not.toMatch(/=== AÇÕES A EXERCER ===/);
    expect(e).not.toMatch(/o mapa abaixo/);
  });

  it('manda percorrer a tela e mantém o documento como âmbito', () => {
    const e = montarEnunciado(SEM_MAPA);
    expect(e).toMatch(/percorr/i);
    expect(e).toMatch(/CT-01/);
  });

  it('diz o que fazer com um caso sem controlo na tela', () => {
    expect(montarEnunciado(SEM_MAPA)).toMatch(/nao_aplicavel/);
  });

  it('a precedência deixa de citar a promessa do mapa', () => {
    const e = montarEnunciado({ ...SEM_MAPA, insumos: [{ ref: 'x.md', texto: 'requisito' }] });
    expect(e).toMatch(/=== REQUISITOS TÉCNICOS ===/);
    expect(e).not.toMatch(/promessa da ação, escrita no mapa/);
  });

  it('com mapa, continua tudo como estava', () => {
    const e = montarEnunciado(ARGS);
    expect(e).toMatch(/=== AÇÕES A EXERCER ===/);
    expect(e).toMatch(/A01/);
  });
});
