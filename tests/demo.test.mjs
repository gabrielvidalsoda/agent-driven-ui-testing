import { describe, it, expect } from 'vitest';
import {
  RESPOSTA_GRAVADA, contagem, atoEntrada, atoEnunciado, atoGuardas, atoNiveis, atoReal,
} from '../src/demo.mjs';
import { validar } from '../src/esquema.mjs';

const MAPA = {
  documento: 'gestao-armazem/associacao-caixa.md',
  rota: '/armazem/associacao-caixa',
  mapeado_em: '2026-08-19',
  mapeado_contra: { ui: 'origin/develop 30446d5' },
  accoes: [
    { id: 'abrir-caixa', tipo: 'criacao', nome: 'Abrir caixa', casos_documento: ['CT-01'] },
    { id: 'pesquisar-listagem', tipo: 'consulta', nome: 'Pesquisar', casos_documento: ['CT-09'] },
    { id: 'filtrar-estado-associacao', tipo: 'filtro', nome: 'Filtrar estado', casos_documento: ['CT-10'] },
    { id: 'filtrar-pedido-pagamento', tipo: 'filtro', nome: 'Filtrar PP', casos_documento: ['CT-11'] },
    { id: 'exportar-xlsx-listagem', tipo: 'exportacao', nome: 'Exportar', casos_documento: ['CT-14'] },
    { id: 'nunca-exercida', tipo: 'navegacao', nome: 'Ver listagem', casos_documento: [] },
    {
      id: 'corrigir-factura-lotes-observacoes',
      tipo: 'edicao',
      nome: 'Corrigir factura',
      casos_documento: ['CT-07'],
      equivalente_aproximado: true,
      ressalva: 'e uma correccao a posteriori, nao o encerramento da caixa',
    },
  ],
  casos_sem_accao: ['CT-02', 'CT-03'],
  insumos_necessarios: [{ descricao: 'caixa', obtivel: 'bd' }],
  repescagem: {
    feita_em: '2026-08-19',
    alvos: [
      { alvo: 'CT-02', resultado: 'nao_existe' },
      { alvo: 'CT-03', resultado: 'nao_existe' },
      { alvo: 'CT-07', resultado: 'encontrado' },
      { alvo: 'CT-08', resultado: 'encontrado' },
      { alvo: 'CT-12', resultado: 'nao_existe' },
    ],
  },
};

describe('a resposta gravada da demo', () => {
  it('e valida contra o esquema de producao', () => {
    expect(validar(RESPOSTA_GRAVADA).valido).toBe(true);
  });

  // A demo so demonstra as guardas se a resposta as accionar. Sem estes casos, os atos 3 e 4
  // imprimiriam uma tabela sem nada para mostrar, e ninguem daria por isso.
  it('traz um caso de cada situacao que as guardas apanham', () => {
    const ids = RESPOSTA_GRAVADA.casos.map((caso) => caso.id);
    const caso = (id) => RESPOSTA_GRAVADA.casos.find((c) => c.id === id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(caso('CT-14').veredicto).toBe('falha');
    expect(caso('CT-14').evidencia).toEqual([]);
    expect(caso('CT-02').categoria).toBeUndefined();
    expect(caso('CT-07').accao).toBe('corrigir-factura-lotes-observacoes');
    expect(RESPOSTA_GRAVADA.casos.some((c) => c.gravidade === 'severa')).toBe(true);
    expect(RESPOSTA_GRAVADA.casos.some((c) => c.categoria === 'estilo')).toBe(true);
    expect(RESPOSTA_GRAVADA.registos_criados.some((r) => !r.removido)).toBe(true);
    expect(RESPOSTA_GRAVADA.insumos.some((i) => i.origem === 'bd' && !i.sql)).toBe(true);
  });
});

describe('atoGuardas', () => {
  const linhas = atoGuardas({ mapa: MAPA }).join('\n');

  it('mostra a falha sem prova a degradar para bloqueado', () => {
    expect(linhas).toMatch(/CT-14.*degradada para bloqueado/);
  });

  it('mostra o equivalente aproximado a converter o veredicto', () => {
    expect(linhas).toMatch(/CT-07.*nao_aplicavel/);
  });

  it('mostra a classificacao assumida quando o agente a omite', () => {
    expect(linhas).toMatch(/CT-02.*assumido funcionalidade\/media/);
  });

  it('mostra o registo por limpar e o insumo sem sql', () => {
    expect(linhas).toMatch(/registo por limpar a mao/);
    expect(linhas).toMatch(/insumo lido da base sem o sql/);
  });

  it('mostra a accao do mapa que nenhum caso exerceu', () => {
    expect(linhas).toMatch(/nunca-exercida.*cobertura em falta/);
  });
});

describe('atoNiveis', () => {
  const linhas = atoNiveis({ mapa: MAPA });

  it('tem uma linha por regua', () => {
    expect(linhas.filter((linha) => /^ {2}[123] /.test(linha))).toHaveLength(3);
  });

  // E o ponto todo do ato: baixar a regua tira falhas do relatorio e nunca toca na
  // contabilidade da cobertura.
  it('aperta as falhas e deixa a cobertura igual nos tres niveis', () => {
    const numeros = linhas
      .filter((linha) => /^ {2}[123] /.test(linha))
      .map((linha) => linha.trim().split(/\s+/).map(Number))
      .map(([nivel, falha, achados, fora, passa, bloqueado, naoAplicavel]) =>
        ({ nivel, falha, achados, fora, passa, bloqueado, naoAplicavel }));

    expect(numeros.map((n) => n.falha)).toEqual([3, 2, 1]);
    expect(numeros.map((n) => n.achados)).toEqual([2, 1, 1]);
    expect(numeros.map((n) => n.fora)).toEqual([0, 2, 3]);
    for (const n of numeros) {
      expect(n.passa).toBe(1);
      expect(n.bloqueado).toBe(1);
      expect(n.naoAplicavel).toBe(2);
    }
  });
});

describe('contagem', () => {
  it('conta cada veredicto e o que ficou fora de nivel', () => {
    expect(contagem(RESPOSTA_GRAVADA)).toMatchObject({
      total: 7, passa: 2, falha: 4, bloqueado: 0, nao_aplicavel: 1, achados: 2, fora_de_nivel: 0,
    });
  });
});

describe('atoEntrada', () => {
  const linhas = atoEntrada({ mapa: MAPA, casosDoDocumento: 13 }).join('\n');

  it('diz quantos casos o documento escreveu e quantas accoes a tela entrega', () => {
    expect(linhas).toMatch(/13 casos escritos/);
    expect(linhas).toMatch(/A tela entrega 7 accoes/);
  });

  it('nomeia os casos que a tela nao entrega e a ressalva do equivalente', () => {
    expect(linhas).toMatch(/CT-02, CT-03/);
    expect(linhas).toMatch(/nao o encerramento da caixa/);
  });

  it('resume a repescagem sem despejar todos os alvos', () => {
    expect(linhas).toMatch(/procurou 5 alvos/);
    expect(linhas).toMatch(/mais 1/);
  });
});

describe('atoEnunciado', () => {
  it('mede o enunciado e mostra as regras numeradas', () => {
    const enunciado = ['## Regras', '1. NUNCA INVENTES MASSA.', '2. ESCREVES SO O QUE CRIASTE.', 'texto solto'].join('\n');
    const linhas = atoEnunciado({ enunciado }).join('\n');
    expect(linhas).toMatch(/4 linhas/);
    expect(linhas).toMatch(/NUNCA INVENTES MASSA/);
    expect(linhas).not.toMatch(/texto solto/);
  });
});

describe('atoReal', () => {
  it('soma os documentos e calcula a media, o mais caro e o mais barato', () => {
    const documentos = [
      { nome: 'a', casos: 10, passa: 4, falha: 1, bloqueado: 5, achados: 2, custo: 1 },
      { nome: 'b', casos: 20, passa: 8, falha: 3, bloqueado: 9, achados: 4, custo: 3 },
    ];
    const linhas = atoReal({ documentos }).join('\n');
    expect(linhas).toMatch(/TOTAL\s+30\s+12\s+4\s+14\s+6\s+\$4\.00/);
    expect(linhas).toMatch(/Media por documento: \$2\.00/);
    expect(linhas).toMatch(/Mais caro: \$3\.00/);
    expect(linhas).toMatch(/mais barato: \$1\.00/);
  });
});
