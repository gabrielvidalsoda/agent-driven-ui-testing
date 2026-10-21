import { describe, it, expect } from 'vitest';
import { normalizar } from '../src/normalizar.mjs';

const BASE = {
  documento: 'gestao-armazem/registo-entrada.md',
  estado: 'concluido',
  casos: [],
  achados: [],
};

const falhaDe = (extra) => ({
  id: 'CT-05', veredicto: 'falha', esperado: 'x', observado: 'y', evidencia: ['ct05.png'], ...extra,
});

describe('classificacao em falta', () => {
  it('preenche categoria e gravidade com o valor prudente e avisa', () => {
    const { resposta, avisos } = normalizar({ ...BASE, casos: [falhaDe({})] }, { nivel: 1 });
    expect(resposta.casos[0].categoria).toBe('funcionalidade');
    expect(resposta.casos[0].gravidade).toBe('media');
    expect(avisos.join(' ')).toMatch(/CT-05.*sem categoria/i);
  });

  it('nao mexe no que ja vem classificado', () => {
    const caso = falhaDe({ categoria: 'layout', gravidade: 'baixa' });
    const { resposta, avisos } = normalizar({ ...BASE, casos: [caso] }, { nivel: 1 });
    expect(resposta.casos[0].categoria).toBe('layout');
    expect(avisos).toEqual([]);
  });
});

describe('degradacao antes do filtro', () => {
  it('uma falha sem evidencia fica bloqueada e nao vai para fora_de_nivel', () => {
    const semProva = { ...BASE, casos: [falhaDe({ evidencia: [], categoria: 'estilo', gravidade: 'baixa' })] };
    const { resposta, avisos } = normalizar(semProva, { nivel: 3 });
    expect(resposta.casos[0].veredicto).toBe('bloqueado');
    expect(resposta.fora_de_nivel).toEqual([]);
    expect(avisos).toContain('CT-05: falha sem evidência, degradada para bloqueado');
  });

  it('nao mexe numa falha com evidencia', () => {
    const comProva = { ...BASE, casos: [falhaDe({ categoria: 'funcionalidade', gravidade: 'severa' })] };
    const { resposta, avisos } = normalizar(comProva, { nivel: 3 });
    expect(resposta.casos[0].veredicto).toBe('falha');
    expect(avisos).toEqual([]);
  });
});

describe('filtro de nivel', () => {
  const casos = [
    falhaDe({ id: 'CT-01', categoria: 'funcionalidade', gravidade: 'severa' }),
    falhaDe({ id: 'CT-02', categoria: 'layout', gravidade: 'media' }),
    falhaDe({ id: 'CT-03', categoria: 'estilo', gravidade: 'baixa' }),
    { id: 'CT-04', veredicto: 'passa', esperado: 'x', observado: 'x', evidencia: [],
      categoria: 'estilo', gravidade: 'baixa' },
    { id: 'CT-05', veredicto: 'nao_aplicavel', esperado: 'concluir', observado: 'nao existe',
      evidencia: [], categoria: 'funcionalidade', gravidade: 'baixa' },
  ];

  it('o nivel 1 nao filtra nada', () => {
    const { resposta } = normalizar({ ...BASE, casos }, { nivel: 1 });
    expect(resposta.casos).toHaveLength(5);
    expect(resposta.fora_de_nivel).toEqual([]);
  });

  it('o nivel 2 tira a falha de estilo e deixa a de layout', () => {
    const { resposta, avisos } = normalizar({ ...BASE, casos }, { nivel: 2 });
    expect(resposta.casos.map((c) => c.id)).toEqual(['CT-01', 'CT-02', 'CT-04', 'CT-05']);
    expect(resposta.fora_de_nivel.map((c) => c.id)).toEqual(['CT-03']);
    expect(avisos.join(' ')).toMatch(/CT-03.*fora do nivel 2/i);
  });

  it('o nivel 3 deixa so a falha de funcionalidade severa', () => {
    const { resposta } = normalizar({ ...BASE, casos }, { nivel: 3 });
    expect(resposta.casos.map((c) => c.id)).toEqual(['CT-01', 'CT-04', 'CT-05']);
    expect(resposta.fora_de_nivel.map((c) => c.id)).toEqual(['CT-02', 'CT-03']);
  });

  it('nunca filtra passa, bloqueado nem nao_aplicavel', () => {
    const { resposta } = normalizar({ ...BASE, casos }, { nivel: 3 });
    expect(resposta.casos.map((c) => c.id)).toContain('CT-04');
    expect(resposta.casos.map((c) => c.id)).toContain('CT-05');
  });

  it('o total de casos mais fora_de_nivel nao muda com o nivel', () => {
    for (const nivel of [1, 2, 3]) {
      const { resposta } = normalizar({ ...BASE, casos }, { nivel });
      const doTipoCaso = resposta.fora_de_nivel.filter((i) => i.tipo === 'caso');
      expect(resposta.casos.length + doTipoCaso.length).toBe(5);
    }
  });

  it('filtra achados e marca-lhes o tipo', () => {
    const achados = [
      { titulo: 'grava o que nao devia', descricao: 'd', confianca: 'alta',
        categoria: 'funcionalidade', gravidade: 'severa' },
      { titulo: 'podia ter um atalho', descricao: 'd', confianca: 'baixa',
        categoria: 'melhoria', gravidade: 'baixa' },
    ];
    const { resposta } = normalizar({ ...BASE, achados }, { nivel: 2 });
    expect(resposta.achados).toHaveLength(1);
    expect(resposta.fora_de_nivel[0]).toMatchObject({ tipo: 'achado', titulo: 'podia ter um atalho' });
  });

  it('sem nivel dado, vale a omissao 2', () => {
    const { resposta } = normalizar({ ...BASE, casos });
    expect(resposta.casos.map((c) => c.id)).toEqual(['CT-01', 'CT-02', 'CT-04', 'CT-05']);
  });

  it('grava o nivel na resposta, para o veredicto nao se ler sem a regua', () => {
    expect(normalizar({ ...BASE }, { nivel: 3 }).resposta.nivel).toBe(3);
  });
});

describe('evidencia dos insumos', () => {
  it('avisa por insumo lido da base sem o sql', () => {
    const { avisos } = normalizar({ ...BASE, insumos: [{ descricao: 'caixa', origem: 'bd' }] });
    expect(avisos.join(' ')).toMatch(/insumo lido da base sem o sql/i);
    expect(avisos.join(' ')).toMatch(/caixa/);
  });

  it('nao avisa por insumo lido da tela', () => {
    const { avisos } = normalizar({ ...BASE, insumos: [{ descricao: 'caixa', origem: 'tela' }] });
    expect(avisos).toEqual([]);
  });

  it('avisa por registo escrito na base sem o sql', () => {
    const { avisos } = normalizar({
      ...BASE,
      registos_criados: [{ descricao: 'caixa', via: 'bd', removido: true }],
    });
    expect(avisos.join(' ')).toMatch(/registo escrito na base sem o sql/i);
    expect(avisos.join(' ')).toMatch(/caixa/);
  });

  it('nao avisa quando tudo foi removido pela tela', () => {
    const { avisos } = normalizar({
      ...BASE,
      registos_criados: [{ descricao: 'caixa de teste', via: 'tela', removido: true }],
    });
    expect(avisos).toEqual([]);
  });

  it('continua a avisar do que ficou por limpar', () => {
    const { avisos } = normalizar({
      ...BASE,
      registos_criados: [{ descricao: 'caixa', identificacao: 'PIID 42', removido: false, razao: 'sem accao de apagar' }],
    });
    expect(avisos.join(' ')).toMatch(/por limpar a mao.*PIID 42.*sem accao de apagar/i);
  });
});

// A defesa do outro lado: mesmo que o testador ligue um CT-nn a uma acção que o mapa marcou
// como equivalente aproximado, o veredicto não pode ser `passa` — seria passa sobre a coisa
// errada. Vira `nao_aplicavel`, que é a divergência documento×produto que o analista quer ver.
describe('normalizar com um mapa que tem equivalentes aproximados', () => {
  const MAPA_EQ = {
    accoes: [
      { id: 'ac-corrigir', tipo: 'edicao', nome: 'Corrigir caixa', como: 'ecrã /arquivo',
        promessa: 'força o estado da caixa', equivalente_aproximado: true,
        ressalva: 'correção manual, não o Encerrar com validação' },
      { id: 'ac-listar', tipo: 'consulta', nome: 'Listar', como: 'ecrã inicial', promessa: 'uma linha por caixa' },
    ],
  };

  const correr = (casos) => normalizar({ casos }, { mapa: MAPA_EQ });

  it('força a nao_aplicavel o caso exercido contra o substituto', () => {
    const { resposta } = correr([{ id: 'CT-08', accao: 'ac-corrigir', veredicto: 'passa',
                                  categoria: 'funcionalidade', gravidade: 'media' }]);
    expect(resposta.casos[0].veredicto).toBe('nao_aplicavel');
  });

  it('diz no observado porque e que o passa nao vale', () => {
    const { resposta } = correr([{ id: 'CT-08', accao: 'ac-corrigir', veredicto: 'passa',
                                  observado: 'a caixa passou a Aguardando preparação',
                                  categoria: 'funcionalidade', gravidade: 'media' }]);
    expect(resposta.casos[0].observado).toMatch(/a caixa passou a Aguardando preparação/);
    expect(resposta.casos[0].observado).toMatch(/correção manual, não o Encerrar com validação/);
  });

  it('avisa, para o desvio nao passar despercebido no resumo', () => {
    const { avisos } = correr([{ id: 'CT-08', accao: 'ac-corrigir', veredicto: 'passa',
                                 categoria: 'funcionalidade', gravidade: 'media' }]);
    expect(avisos.some((a) => /CT-08/.test(a) && /equivalente aproximado/.test(a))).toBe(true);
  });

  it('também converte uma falha: falhar um substituto nao e falhar o caso', () => {
    const { resposta } = correr([{ id: 'CT-08', accao: 'ac-corrigir', veredicto: 'falha',
                                  evidencia: ['x.png'], categoria: 'funcionalidade', gravidade: 'alta' }]);
    expect(resposta.casos[0].veredicto).toBe('nao_aplicavel');
  });

  it('nao mexe no caso exercido contra uma accao normal', () => {
    const { resposta } = correr([{ id: 'CT-01', accao: 'ac-listar', veredicto: 'passa',
                                  categoria: 'funcionalidade', gravidade: 'media' }]);
    expect(resposta.casos[0].veredicto).toBe('passa');
  });

  it('sem mapa, nao força nada', () => {
    const { resposta } = normalizar({ casos: [{ id: 'CT-08', accao: 'ac-corrigir', veredicto: 'passa',
                                                categoria: 'funcionalidade', gravidade: 'media' }] });
    expect(resposta.casos[0].veredicto).toBe('passa');
  });
});
