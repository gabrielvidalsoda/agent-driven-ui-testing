import { describe, it, expect } from 'vitest';
import { seccoesDoMenu } from '../src/menu.mjs';

const TSX = `
const menuItems: MenuEntry[] = [
  { _id: 'home', title: 'Início', icon: 'home', url: '/' },
  {
    _id: 'gestao-armazem',
    title: 'Gestão de Armazém',
    icon: 'box',
    children: [
      { _id: 'arm-registo-entrada', title: 'Registo de Entrada', url: '/armazem/registo-entrada' },
      {
        _id: 'arm-associacao-caixa',
        title: 'Associação à Caixa',
        url: '/armazem/associacao-caixa',
      },
      { _id: 'arm-sem-ecra', title: 'Em breve' },
    ],
  },
  {
    _id: 'conferencia',
    title: 'Conferência',
    children: [
      {
        _id: 'area-medicamentos',
        title: 'Medicamentos',
        children: [{ _id: 'med-lotes', title: 'Lotes', url: '/medicamentos/lote' }],
      },
    ],
  },
];
`;

describe('seccoesDoMenu', () => {
  it('devolve uma entrada por secção de topo', () => {
    expect(seccoesDoMenu(TSX).map((s) => s.id)).toEqual(['home', 'gestao-armazem', 'conferencia']);
  });

  it('traz o título tal como aparece no menu', () => {
    expect(seccoesDoMenu(TSX)[1].titulo).toBe('Gestão de Armazém');
  });

  it('recolhe os urls da secção sem a barra inicial', () => {
    expect(seccoesDoMenu(TSX)[1].urls).toEqual(['armazem/registo-entrada', 'armazem/associacao-caixa']);
  });

  it('não confunde um item de terceiro nível com uma secção de topo', () => {
    expect(seccoesDoMenu(TSX)[2].urls).toEqual(['medicamentos/lote']);
  });

  it('descarta a raiz, que não é alvo de tela nenhuma', () => {
    expect(seccoesDoMenu(TSX)[0].urls).toEqual([]);
  });

  it('explica-se quando o ficheiro não tem menu nenhum', () => {
    expect(() => seccoesDoMenu('export const x = 1;')).toThrow(/menuItems/);
  });
});
