import { describe, it, expect } from 'vitest';
import { validar } from '../src/esquema.mjs';

const RESPOSTA_BOA = {
  documento: 'consulta-area-prestacao/medicamentos-prestacoes.md',
  estado: 'concluido',
  casos: [
    { id: 'CT-01', veredicto: 'passa', esperado: '14 prestações', observado: '14 prestações', evidencia: ['ct01.png'] },
  ],
  achados: [],
  notas_ambiente: [],
};

describe('validar', () => {
  it('aceita uma resposta completa', () => {
    expect(validar(RESPOSTA_BOA)).toEqual({ valido: true, erros: [] });
  });

  it('recusa um veredicto desconhecido', () => {
    const má = { ...RESPOSTA_BOA, casos: [{ ...RESPOSTA_BOA.casos[0], veredicto: 'talvez' }] };
    const r = validar(má);
    expect(r.valido).toBe(false);
    expect(r.erros.join(' ')).toMatch(/veredicto/);
  });

  it('recusa uma resposta sem documento', () => {
    const { documento, ...semDocumento } = RESPOSTA_BOA;
    expect(validar(semDocumento).valido).toBe(false);
  });

  it('aceita casos vazios (documentos sem CT-nn, como dashboards/artefactos.md)', () => {
    expect(validar({ ...RESPOSTA_BOA, casos: [] }).valido).toBe(true);
  });

  it('aceita o veredicto nao_aplicavel', () => {
    const naoAplicavel = {
      ...RESPOSTA_BOA,
      casos: [{ id: 'CT-05', veredicto: 'nao_aplicavel', esperado: 'concluir registo',
                observado: 'a tela nao tem accao de concluir', evidencia: [] }],
    };
    expect(validar(naoAplicavel).valido).toBe(true);
  });

  it('aceita categoria e gravidade nos casos e nos achados', () => {
    const classificada = {
      ...RESPOSTA_BOA,
      casos: [{ ...RESPOSTA_BOA.casos[0], categoria: 'funcionalidade', gravidade: 'severa' }],
      achados: [{ titulo: 'x', descricao: 'y', confianca: 'alta',
                  categoria: 'melhoria', gravidade: 'baixa' }],
    };
    expect(validar(classificada).valido).toBe(true);
  });

  it('nao exige categoria nem gravidade: quem preenche o que falta e o normalizar', () => {
    expect(validar(RESPOSTA_BOA).valido).toBe(true);
  });

  it('recusa uma categoria desconhecida', () => {
    const ma = { ...RESPOSTA_BOA, casos: [{ ...RESPOSTA_BOA.casos[0], categoria: 'usabilidade' }] };
    expect(validar(ma).valido).toBe(false);
  });

  it('aceita insumos com a origem e o sql', () => {
    const comInsumos = {
      ...RESPOSTA_BOA,
      insumos: [{ descricao: 'caixa em Aguardando preparacao', origem: 'bd',
                  identificacao: 'PIID 4200001',
                  sql: 'SELECT PIID FROM GESTARMAZEM.TDCAIXA WHERE XSESTADO = 1',
                  usado_em: ['CT-04', 'A07'] }],
    };
    expect(validar(comInsumos).valido).toBe(true);
  });

  it('recusa um insumo sem origem', () => {
    const semOrigem = { ...RESPOSTA_BOA, insumos: [{ descricao: 'caixa' }] };
    expect(validar(semOrigem).valido).toBe(false);
  });

  it('aceita registos criados pela base, com o sql', () => {
    const criado = {
      ...RESPOSTA_BOA,
      registos_criados: [{ descricao: 'caixa de teste', via: 'bd', identificacao: 'PIID 4200001',
                           sql: "INSERT INTO ... 'AGENTE-20260819-preparacao'", removido: true }],
    };
    expect(validar(criado).valido).toBe(true);
  });
});

describe('registos criados na base', () => {
  const base = {
    documento: 'x.md',
    estado: 'concluido',
    casos: [{ id: 'CT-01', veredicto: 'passa', esperado: 'a', observado: 'a', evidencia: [] }],
    achados: [],
  };

  it('aceita uma resposta sem registos criados', () => {
    expect(validar(base).valido).toBe(true);
  });

  it('exige descrição e removido em cada registo', () => {
    const r = { ...base, registos_criados: [{ identificacao: 'caixa 999' }] };
    expect(validar(r).valido).toBe(false);
  });
});
