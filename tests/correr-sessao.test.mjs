import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarAlvos } from '../src/alvos.mjs';
import { documentosDaSessao } from '../src/cli/correr-sessao.mjs';

function alvosTemporarios(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'sessao-'));
  const caminho = join(dir, 'alvos.yaml');
  writeFileSync(caminho, conteudo, 'utf8');
  return carregarAlvos(caminho);
}

const YAML = `
documentos:
  gestao-armazem/registo-entrada.md:
    rota: armazem/registo-entrada
    sessao: gestao-armazem
    escrita: true
  gestao-armazem/preparacao.md:
    rota: POR_PREENCHER
    sessao: gestao-armazem
    escrita: true
  conferencia/cockpit.md:
    rota: conferencia/cockpit
    sessao: conferencia
    escrita: false
`;

describe('documentosDaSessao', () => {
  it('devolve só os documentos da sessão pedida', () => {
    expect(documentosDaSessao(alvosTemporarios(YAML), 'conferencia')).toEqual(['conferencia/cockpit.md']);
  });

  it('deixa de fora os que ainda não têm rota', () => {
    expect(documentosDaSessao(alvosTemporarios(YAML), 'gestao-armazem')).toEqual([
      'gestao-armazem/registo-entrada.md',
    ]);
  });

  it('devolve vazio para uma sessão sem documentos', () => {
    expect(documentosDaSessao(alvosTemporarios(YAML), 'fecho')).toEqual([]);
  });
});

describe('a configuração real', () => {
  it('tem os nove documentos de Gestão de Armazém com rota', () => {
    const alvos = carregarAlvos('config/alvos.yaml');
    expect(documentosDaSessao(alvos, 'gestao-armazem')).toHaveLength(9);
  });

  it('só declara sessões que o sessoes.yaml conhece', async () => {
    const { carregarSessoes } = await import('../src/sessoes.mjs');
    const sessoes = carregarSessoes('config/sessoes.yaml');
    const alvos = carregarAlvos('config/alvos.yaml');
    const semSessao = [...alvos.values()].map((a) => a.sessao).filter((s) => !sessoes.has(s));
    expect([...new Set(semSessao)]).toEqual([]);
  });
});

describe('retomar só alguns documentos', () => {
  it('sem --apenas devolve a sessão inteira', () => {
    expect(documentosDaSessao(alvosTemporarios(YAML), 'gestao-armazem')).toEqual([
      'gestao-armazem/registo-entrada.md',
    ]);
  });

  it('com --apenas devolve só os escolhidos', () => {
    const alvos = alvosTemporarios(YAML);
    expect(documentosDaSessao(alvos, 'conferencia', ['conferencia/cockpit.md'])).toEqual([
      'conferencia/cockpit.md',
    ]);
  });

  it('ignora um escolhido que não é da sessão', () => {
    const alvos = alvosTemporarios(YAML);
    expect(documentosDaSessao(alvos, 'gestao-armazem', ['conferencia/cockpit.md'])).toEqual([]);
  });

  it('nunca ressuscita um documento sem rota, mesmo escolhido à mão', () => {
    const alvos = alvosTemporarios(YAML);
    expect(documentosDaSessao(alvos, 'gestao-armazem', ['gestao-armazem/preparacao.md'])).toEqual([]);
  });
});
