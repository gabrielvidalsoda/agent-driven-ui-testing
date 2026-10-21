import { describe, it, expect } from 'vitest';
import { montarEnunciadoRepescagem } from '../src/enunciado-repescagem.mjs';

const ARGS = {
  documento: 'gestao-armazem/registo-entrada.md',
  texto: '## CT-05 Concluir registo\n## CT-14 Concorrência',
  url: 'http://localhost:4174/armazem/registo-entrada',
  pastaEvidencias: 'C:/corridas/repescagem',
  alvos: [
    { alvo: 'CT-05', tipo: 'caso' },
    { alvo: 'registo concluído', tipo: 'insumo', razao: 'não há acção de concluir' },
  ],
  irmas: [
    { documento: 'gestao-armazem/preparacao.md', url: 'http://localhost:4174/armazem/preparacao' },
    { documento: 'gestao-armazem/picking-expedicao.md', url: 'http://localhost:4174/picking-expedicao' },
  ],
};

describe('montarEnunciadoRepescagem', () => {
  const e = montarEnunciadoRepescagem(ARGS);

  it('leva os alvos e a razao que a primeira passagem deu', () => {
    expect(e).toContain('CT-05');
    expect(e).toContain('registo concluído');
    expect(e).toContain('não há acção de concluir');
  });

  it('pede sinonimos do rotulo', () => {
    expect(e).toMatch(/Terminar, Fechar, Finalizar, Encerrar/);
  });

  it('manda visitar as outras telas da mesma seccao de menu', () => {
    expect(e).toMatch(/NOUTRA TELA DA MESMA SECÇÃO DE MENU/);
    expect(e).toContain('http://localhost:4174/armazem/preparacao');
    expect(e).toContain('gestao-armazem/picking-expedicao.md');
  });

  it('diz que fazer quando nao ha telas irmas', () => {
    const so = montarEnunciadoRepescagem({ ...ARGS, irmas: [] });
    expect(so).toMatch(/não há outras telas nesta secção de menu/);
  });

  it('continua a proibir submeter, em qualquer das telas', () => {
    expect(e).toMatch(/NÃO SUBMETES NADA/);
    expect(e).toMatch(/em nenhuma das telas que visitares/);
  });

  it('exige dizer o que procurou e onde, tenha encontrado ou nao', () => {
    expect(e).toMatch(/DIZES O QUE PROCURASTE E ONDE/);
    expect(e).toMatch(/tenhas encontrado ou não/);
  });

  it('desincentiva inventar uma accao para nao vir de maos vazias', () => {
    expect(e).toMatch(/Não inventes uma ação/);
    expect(e).toMatch(/«Não existe» é a resposta certa na/);
  });

  it('manda por a rota quando a accao vive noutra tela', () => {
    expect(e).toMatch(/pões a rota dessa tela no campo "rota"/);
  });

  it('leva o esquema e fixa o documento', () => {
    expect(e).toMatch(/nao_existe/);
    expect(e).toContain('tem de ser exatamente: gestao-armazem/registo-entrada.md');
  });
});
