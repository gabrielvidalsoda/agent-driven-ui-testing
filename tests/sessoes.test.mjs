import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarSessoes, sessaoDe, divergenciasComMenu } from '../src/sessoes.mjs';

function ficheiroTemporario(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'sessoes-'));
  const caminho = join(dir, 'sessoes.yaml');
  writeFileSync(caminho, conteudo, 'utf8');
  return caminho;
}

const YAML_BOM = `
sessoes:
  gestao-armazem:
    titulo: Gestão de Armazém
    paralelo: false
    perfil:
      utilizador: supervisor.armazem
      storage_state: perfis/gestao-armazem.json
  conferencia:
    titulo: Conferência
`;

describe('carregarSessoes', () => {
  it('carrega título, paralelo e perfil', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    expect(mapa.get('gestao-armazem')).toEqual({
      titulo: 'Gestão de Armazém',
      paralelo: false,
      perfil: { utilizador: 'supervisor.armazem', storage_state: 'perfis/gestao-armazem.json' },
    });
  });

  it('sem paralelo nem perfil, assume série e perfil vazio', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    expect(mapa.get('conferencia')).toEqual({ titulo: 'Conferência', paralelo: false, perfil: {} });
  });
});

describe('sessaoDe', () => {
  it('explica-se quando a sessão não existe', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    expect(() => sessaoDe(mapa, 'fecho')).toThrow(/fecho/);
  });
});

describe('divergenciasComMenu', () => {
  it('avisa quando o menu tem uma secção que a configuração não conhece', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    const avisos = divergenciasComMenu(mapa, [
      { id: 'gestao-armazem' },
      { id: 'fecho' },
      { id: 'conferencia' },
    ]);
    expect(avisos.join(' ')).toContain('fecho');
  });

  it('avisa quando a configuração tem uma sessão fora do menu', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    expect(divergenciasComMenu(mapa, [{ id: 'gestao-armazem' }]).join(' ')).toContain('conferencia');
  });

  it('não diverge quando coincidem', () => {
    const mapa = carregarSessoes(ficheiroTemporario(YAML_BOM));
    expect(divergenciasComMenu(mapa, [{ id: 'gestao-armazem' }, { id: 'conferencia' }])).toEqual([]);
  });
});
