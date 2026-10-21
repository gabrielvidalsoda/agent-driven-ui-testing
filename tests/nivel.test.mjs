import { describe, it, expect } from 'vitest';
import { resolverNivel, dentroDoNivel, NIVEL_OMISSAO } from '../src/nivel.mjs';

describe('resolverNivel', () => {
  it('a linha de comando ganha a tudo', () => {
    expect(resolverNivel({ cli: 1, documento: 2, global: 3 })).toBe(1);
  });

  it('o documento ganha ao global', () => {
    expect(resolverNivel({ documento: 3, global: 1 })).toBe(3);
  });

  it('o global vale quando mais nada foi dito', () => {
    expect(resolverNivel({ global: 1 })).toBe(1);
  });

  it('sem nada, vale a omissao', () => {
    expect(resolverNivel({})).toBe(NIVEL_OMISSAO);
    expect(NIVEL_OMISSAO).toBe(2);
  });

  it('aceita numero em texto, que e o que vem da linha de comando', () => {
    expect(resolverNivel({ cli: '3' })).toBe(3);
  });

  it('recusa um nivel fora de 1 a 3', () => {
    expect(() => resolverNivel({ cli: 4 })).toThrow(/nivel/i);
    expect(() => resolverNivel({ global: 0 })).toThrow(/nivel/i);
    expect(() => resolverNivel({ documento: 'alto' })).toThrow(/nivel/i);
  });
});

describe('dentroDoNivel', () => {
  const funcionalidadeSevera = { categoria: 'funcionalidade', gravidade: 'severa' };
  const funcionalidadeMedia = { categoria: 'funcionalidade', gravidade: 'media' };
  const quebraDeLayout = { categoria: 'layout', gravidade: 'media' };
  const cosmetico = { categoria: 'estilo', gravidade: 'baixa' };
  const melhoria = { categoria: 'melhoria', gravidade: 'baixa' };

  it('o nivel 1 aceita tudo, melhorias incluidas', () => {
    for (const item of [funcionalidadeSevera, funcionalidadeMedia, quebraDeLayout, cosmetico, melhoria]) {
      expect(dentroDoNivel(item, 1)).toBe(true);
    }
  });

  it('o nivel 2 aceita funcionalidade e quebra de layout, e recusa estilo e melhorias', () => {
    expect(dentroDoNivel(funcionalidadeMedia, 2)).toBe(true);
    expect(dentroDoNivel(quebraDeLayout, 2)).toBe(true);
    expect(dentroDoNivel(cosmetico, 2)).toBe(false);
    expect(dentroDoNivel(melhoria, 2)).toBe(false);
  });

  it('o nivel 3 aceita so funcionalidade severa', () => {
    expect(dentroDoNivel(funcionalidadeSevera, 3)).toBe(true);
    expect(dentroDoNivel(funcionalidadeMedia, 3)).toBe(false);
    expect(dentroDoNivel(quebraDeLayout, 3)).toBe(false);
  });
});
