import { describe, it, expect } from 'vitest';
import { montarEnunciado } from '../src/enunciado.mjs';

const MAPA = {
  documento: 'gestao-armazem/registo-entrada.md',
  rota: 'armazem/registo-entrada',
  accoes: [
    { id: 'A01', tipo: 'consulta', nome: 'Pesquisar por ciclo', como: 'preencher Ciclo',
      promessa: 'grelha com os registos', casos_documento: ['CT-01'] },
  ],
  casos_sem_accao: [],
};

const ARGS = {
  documento: 'gestao-armazem/registo-entrada.md',
  texto: '### CT-01\npesquisar por ciclo',
  url: 'http://localhost:4174/armazem/registo-entrada',
  pastaEvidencias: 'C:/corridas/2026-08-31/registo-entrada',
  marcador: 'AGENTE-20260831-registo-entrada',
  mapa: MAPA,
  nivel: 3,
};

const INSUMOS = [
  { ref: 'ccmsns-docs-code:docs/padroes/api-rest.md', texto: '# API REST\nDatas em ISO-8601.' },
  { ref: 'ccmsns-docs-code:docs/specs/registo-entrada.md', texto: '# Registo de entrada\nO ciclo é obrigatório.' },
];

describe('montarEnunciado com requisitos tecnicos', () => {
  it('inclui o texto de cada requisito', () => {
    const e = montarEnunciado({ ...ARGS, insumos: INSUMOS });
    expect(e).toContain('Datas em ISO-8601.');
    expect(e).toContain('O ciclo é obrigatório.');
  });

  // A referencia vai no enunciado para o agente poder citar a origem de um achado: um achado
  // que diz «contraria o requisito» sem dizer qual nao se verifica.
  it('identifica cada requisito pela referencia', () => {
    const e = montarEnunciado({ ...ARGS, insumos: INSUMOS });
    expect(e).toContain('ccmsns-docs-code:docs/padroes/api-rest.md');
    expect(e).toContain('ccmsns-docs-code:docs/specs/registo-entrada.md');
  });

  it('nao escreve a seccao quando nao ha requisitos', () => {
    expect(montarEnunciado(ARGS)).not.toContain('REQUISITOS TÉCNICOS');
    expect(montarEnunciado({ ...ARGS, insumos: [] })).not.toContain('REQUISITOS TÉCNICOS');
  });

  // O documento de cenarios foi escrito antes de alguem olhar para o ecra e continua a ser a
  // fonte de maior confianca; o requisito so manda onde ele se cala.
  it('poe o documento de cenarios acima do requisito tecnico', () => {
    const e = montarEnunciado({ ...ARGS, insumos: INSUMOS });
    expect(e).toMatch(/documento de cenários manda/i);
    expect(e).toMatch(/onde o documento .*omisso/i);
  });

  // Uma divergencia entre o que foi escrito e o que foi especificado nao e o produto a falhar:
  // contada como falha de um CT-nn, inflacionava a contagem de defeitos do relatorio.
  it('manda tratar divergencia documento-requisito como achado e nao como falha', () => {
    const e = montarEnunciado({ ...ARGS, insumos: INSUMOS });
    expect(e).toMatch(/diverg/i);
    expect(e).toMatch(/achado/i);
    expect(e).toMatch(/nunca uma falha de um caso/i);
  });
});
