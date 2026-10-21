import { describe, it, expect } from 'vitest';
import { alvosDeRepescagem, fundirRepescagem, validarMapa, validarRepescagem } from '../src/mapa.mjs';

const MAPA = {
  documento: 'gestao-armazem/registo-entrada.md',
  rota: 'armazem/registo-entrada',
  mapeado_em: '2026-08-19',
  accoes: [
    { id: 'ac-listar', tipo: 'consulta', nome: 'Listar', como: 'ecrã inicial',
      promessa: 'uma linha por registo', casos_documento: ['CT-01'] },
  ],
  insumos_necessarios: [
    { descricao: 'registo em aberto', obtivel: 'tela' },
    { descricao: 'registo concluído', obtivel: 'nao', razao: 'não há acção de concluir' },
    { descricao: 'segundo operador', obtivel: 'nao', razao: 'inventário físico' },
  ],
  casos_sem_accao: ['CT-05', 'CT-14'],
};

const ACCAO_ACHADA = {
  id: 'ac-encerrar-ciclo', tipo: 'edicao', nome: 'Encerrar ciclo',
  como: 'botão «Encerrar» no ecrã de Preparação, na linha do ciclo',
  promessa: 'o registo passa a Fechado e deixa de aceitar faturas',
  rota: 'armazem/preparacao',
  casos_documento: ['CT-05'],
};

describe('alvosDeRepescagem', () => {
  it('junta os casos sem accao e os insumos impossiveis', () => {
    expect(alvosDeRepescagem(MAPA)).toEqual([
      { alvo: 'CT-05', tipo: 'caso' },
      { alvo: 'CT-14', tipo: 'caso' },
      { alvo: 'registo concluído', tipo: 'insumo', razao: 'não há acção de concluir' },
      { alvo: 'segundo operador', tipo: 'insumo', razao: 'inventário físico' },
    ]);
  });

  it('nao inclui insumos que a tela ou a base resolvem', () => {
    const alvos = alvosDeRepescagem(MAPA).map((a) => a.alvo);
    expect(alvos).not.toContain('registo em aberto');
  });

  it('devolve vazio quando nao ha nada por encontrar, e a passagem nao chega a correr', () => {
    const { casos_sem_accao, ...limpo } = MAPA;
    const semImpossiveis = { ...limpo, insumos_necessarios: [{ descricao: 'x', obtivel: 'tela' }] };
    expect(alvosDeRepescagem(semImpossiveis)).toEqual([]);
  });
});

describe('fundirRepescagem quando encontra', () => {
  const fundido = fundirRepescagem(MAPA, {
    documento: MAPA.documento,
    feita_em: '2026-08-19',
    alvos: [
      { alvo: 'CT-05', procurei: ['Concluir', 'Encerrar'], onde: ['detalhe', 'ecrã de Preparação'],
        resultado: 'encontrado', accao: ACCAO_ACHADA, captura: 'encerrar-ciclo.png',
        nota: 'vive noutra tela da mesma sessão' },
      { alvo: 'CT-14', procurei: ['Concorrência'], onde: ['detalhe'], resultado: 'nao_existe',
        nota: 'precisa de segundo posto' },
      { alvo: 'registo concluído', procurei: ['Encerrar'], onde: ['Preparação'],
        resultado: 'encontrado', obtivel: 'tela', captura: 'preparacao-encerrar.png',
        nota: 'obtém-se encerrando pela Preparação' },
      { alvo: 'segundo operador', procurei: ['trocar operador'], onde: ['cabeçalho', 'menu'],
        resultado: 'nao_existe' },
    ],
  });

  it('acrescenta a accao encontrada, com a rota onde vive', () => {
    const nova = fundido.accoes.find((a) => a.id === 'ac-encerrar-ciclo');
    expect(nova).toBeDefined();
    expect(nova.rota).toBe('armazem/preparacao');
  });

  it('tira do casos_sem_accao o que passou a ter accao', () => {
    expect(fundido.casos_sem_accao).toEqual(['CT-14']);
  });

  it('promove o insumo que afinal se obtem', () => {
    const insumo = fundido.insumos_necessarios.find((i) => i.descricao === 'registo concluído');
    expect(insumo.obtivel).toBe('tela');
    expect(insumo.razao).toMatch(/encerrando pela Preparação/);
  });

  it('deixa intacto o insumo que continua impossivel', () => {
    const insumo = fundido.insumos_necessarios.find((i) => i.descricao === 'segundo operador');
    expect(insumo.obtivel).toBe('nao');
  });

  it('guarda o id da accao, nao a accao inteira, para o mapa nao a repetir', () => {
    const registo = fundido.repescagem.alvos.find((a) => a.alvo === 'CT-05');
    expect(registo.accao).toBe('ac-encerrar-ciclo');
  });

  it('guarda o que procurou e onde, mesmo quando nao encontrou', () => {
    const registo = fundido.repescagem.alvos.find((a) => a.alvo === 'segundo operador');
    expect(registo.resultado).toBe('nao_existe');
    expect(registo.procurei).toEqual(['trocar operador']);
    expect(registo.onde).toEqual(['cabeçalho', 'menu']);
    expect(registo.accao).toBeNull();
  });

  it('o mapa fundido continua a validar', () => {
    expect(validarMapa(fundido)).toEqual({ valido: true, erros: [] });
  });

  it('nao mexe no mapa original', () => {
    expect(MAPA.casos_sem_accao).toEqual(['CT-05', 'CT-14']);
    expect(MAPA.accoes).toHaveLength(1);
  });
});

describe('validarRepescagem', () => {
  const boa = {
    documento: 'a/b.md',
    alvos: [{ alvo: 'CT-05', procurei: ['x'], onde: ['y'], resultado: 'nao_existe' }],
  };

  it('aceita uma resposta minima', () => {
    expect(validarRepescagem(boa).valido).toBe(true);
  });

  it('recusa um resultado desconhecido', () => {
    const ma = { ...boa, alvos: [{ ...boa.alvos[0], resultado: 'talvez' }] };
    expect(validarRepescagem(ma).valido).toBe(false);
  });

  it('exige dizer o que procurou e onde', () => {
    const ma = { ...boa, alvos: [{ alvo: 'CT-05', resultado: 'nao_existe' }] };
    expect(validarRepescagem(ma).valido).toBe(false);
  });

  it('aceita a accao inteira quando encontrou', () => {
    const achou = { ...boa, alvos: [{ ...boa.alvos[0], resultado: 'encontrado', accao: ACCAO_ACHADA }] };
    expect(validarRepescagem(achou).valido).toBe(true);
  });
});

// A repescagem de 19/08 deu `encontrado` a três casos de `faturas-incidencia` com base em
// leitura do código-fonte, com a listagem vazia no ambiente — nunca viu o elemento no ecrã.
// O enunciado já o proibia; o que faltava era o mapa recusar-se a acreditar. Um `encontrado`
// sem captura deixa de promover a ação: fica registado como afirmação por provar, para o
// revisor humano decidir, e o caso continua por cobrir em vez de virar teste sobre nada.
describe('fundirRepescagem exige prova de ecrã para acreditar num encontrado', () => {
  const semProva = () => fundirRepescagem(MAPA, {
    documento: MAPA.documento,
    feita_em: '2026-08-19',
    alvos: [
      { alvo: 'CT-05', procurei: ['Concluir'], onde: ['código-fonte'], resultado: 'encontrado',
        accao: ACCAO_ACHADA, nota: 'li no código que o botão existe' },
      { alvo: 'registo concluído', procurei: ['Encerrar'], onde: ['código-fonte'],
        resultado: 'encontrado', obtivel: 'tela' },
    ],
  });

  it('nao acrescenta a accao que ninguem viu na tela', () => {
    expect(semProva().accoes.find((a) => a.id === 'ac-encerrar-ciclo')).toBeUndefined();
  });

  it('deixa o caso em casos_sem_accao, que e onde ele ainda esta', () => {
    expect(semProva().casos_sem_accao).toEqual(['CT-05', 'CT-14']);
  });

  it('nao promove o insumo sem prova', () => {
    const insumo = semProva().insumos_necessarios.find((i) => i.descricao === 'registo concluído');
    expect(insumo.obtivel).toBe('nao');
  });

  it('regista a afirmacao como encontrado_sem_prova, para nao se perder', () => {
    const registo = semProva().repescagem.alvos.find((a) => a.alvo === 'CT-05');
    expect(registo.resultado).toBe('encontrado_sem_prova');
    expect(registo.accao).toBeNull();
    expect(registo.nota).toMatch(/li no código que o botão existe/);
    expect(registo.accao_alegada).toBe('ac-encerrar-ciclo');
  });

  it('diz porque e que nao acreditou, mesmo quando o agente nao deixou nota', () => {
    const registo = semProva().repescagem.alvos.find((a) => a.alvo === 'registo concluído');
    expect(registo.nota).toMatch(/sem captura/i);
  });

  it('o mapa continua a validar com o resultado novo', () => {
    expect(validarMapa(semProva())).toEqual({ valido: true, erros: [] });
  });

  it('guarda a captura quando ela vem, para o revisor a poder abrir', () => {
    const comProva = fundirRepescagem(MAPA, {
      documento: MAPA.documento,
      alvos: [{ alvo: 'CT-05', procurei: ['Encerrar'], onde: ['Preparação'], resultado: 'encontrado',
                accao: ACCAO_ACHADA, captura: 'encerrar-ciclo.png' }],
    });
    expect(comProva.repescagem.alvos[0].captura).toBe('encerrar-ciclo.png');
  });
});

// Em `associacao-caixa`, o CT-07 e o CT-08 foram ligados a acções do ecrã /arquivo («Corrigir
// factura», «Corrigir caixa») que tratam o mesmo assunto por outro caminho e noutro momento do
// fluxo. O agente foi honesto e escreveu a ressalva, mas nada a fazia valer: o testador ia
// exercer o caso contra o substituto e dar `passa` à coisa errada. Um equivalente aproximado
// entra no mapa como pista — não como cumprimento do caso.
describe('fundirRepescagem com um equivalente aproximado', () => {
  const fundido = fundirRepescagem(MAPA, {
    documento: MAPA.documento,
    alvos: [
      { alvo: 'CT-05', procurei: ['Encerrar'], onde: ['/arquivo'], resultado: 'encontrado',
        accao: ACCAO_ACHADA, captura: 'arquivo-corrigir.png', equivalente_aproximado: true,
        nota: 'é correção manual de estado, não o Encerrar com validação de faturas' },
      { alvo: 'registo concluído', procurei: ['Encerrar'], onde: ['/arquivo'], resultado: 'encontrado',
        captura: 'arquivo-corrigir.png', obtivel: 'tela', equivalente_aproximado: true,
        nota: 'estado forçado à mão, não o que o fluxo produz' },
    ],
  });

  it('acrescenta a accao, porque continua a ser pista boa', () => {
    expect(fundido.accoes.find((a) => a.id === 'ac-encerrar-ciclo')).toBeDefined();
  });

  it('marca a accao como equivalente aproximado, com a ressalva do agente', () => {
    const accao = fundido.accoes.find((a) => a.id === 'ac-encerrar-ciclo');
    expect(accao.equivalente_aproximado).toBe(true);
    expect(accao.ressalva).toMatch(/não o Encerrar com validação/);
  });

  it('NAO tira o caso de casos_sem_accao: o caso continua por cumprir', () => {
    expect(fundido.casos_sem_accao).toEqual(['CT-05', 'CT-14']);
  });

  it('NAO promove o insumo: massa parecida nao e a massa do caso', () => {
    const insumo = fundido.insumos_necessarios.find((i) => i.descricao === 'registo concluído');
    expect(insumo.obtivel).toBe('nao');
  });

  it('o mapa continua a validar', () => {
    expect(validarMapa(fundido)).toEqual({ valido: true, erros: [] });
  });
});
