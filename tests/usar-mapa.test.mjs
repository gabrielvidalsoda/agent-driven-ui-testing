import { describe, it, expect } from 'vitest';
import { resolverUsarMapa, USAR_MAPA_OMISSAO } from '../src/usar-mapa.mjs';

// Mesma precedencia do nivel: quem escreve o comando manda sobre o alvos.yaml, que manda
// sobre o corrida.yaml. Um projeto inteiro corre sem mapa por configuracao, e uma tela em
// especial pode voltar a exigi-lo sem obrigar o resto.
describe('resolverUsarMapa', () => {
  it('sem nada dito, o mapa e obrigatorio', () => {
    expect(resolverUsarMapa({})).toBe(true);
    expect(USAR_MAPA_OMISSAO).toBe(true);
  });

  it('o corrida.yaml desliga o mapa para o projeto todo', () => {
    expect(resolverUsarMapa({ global: false })).toBe(false);
  });

  it('o alvos.yaml ganha ao corrida.yaml', () => {
    expect(resolverUsarMapa({ documento: true, global: false })).toBe(true);
    expect(resolverUsarMapa({ documento: false, global: true })).toBe(false);
  });

  it('a linha de comando ganha a tudo', () => {
    expect(resolverUsarMapa({ cli: false, documento: true, global: true })).toBe(false);
  });

  // undefined nao e false: um campo ausente tem de deixar passar o nivel seguinte, senao
  // qualquer documento sem a chave desligava o mapa em silencio.
  it('um campo ausente nao vale por falso', () => {
    expect(resolverUsarMapa({ cli: undefined, documento: undefined, global: false })).toBe(false);
    expect(resolverUsarMapa({ cli: undefined, documento: undefined, global: undefined })).toBe(true);
  });

  it('recusa um valor que nao seja booleano, em vez de o adivinhar', () => {
    expect(() => resolverUsarMapa({ global: 'talvez' })).toThrow(/corrida.yaml/);
    expect(() => resolverUsarMapa({ documento: 1 })).toThrow(/alvos.yaml/);
  });
});
