import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { redigirTexto, redigirEvidencias, MARCA } from '../src/redigir.mjs';

describe('redigirTexto', () => {
  it('troca a senha pela marca, em todas as ocorrências', () => {
    expect(redigirTexto('user: ana\npass: segredo\nrepetido: segredo', ['segredo']))
      .toBe(`user: ana\npass: ${MARCA}\nrepetido: ${MARCA}`);
  });

  // Uma senha que seja prefixo de outra tem de ser substituida depois da que a contem, senao
  // sobrava metade em claro.
  it('trata primeiro a senha mais comprida quando uma é prefixo da outra', () => {
    expect(redigirTexto('abc123', ['abc', 'abc123'])).toBe(MARCA);
  });

  it('sem segredos, devolve o texto tal e qual', () => {
    expect(redigirTexto('nada a esconder', [])).toBe('nada a esconder');
  });
});

describe('redigirEvidencias', () => {
  function pastaComEvidencias() {
    const dir = mkdtempSync(join(tmpdir(), 'evidencias-'));
    // Como o Playwright MCP despeja a arvore de acessibilidade do ecra de entrada: o valor do
    // campo de senha vem em claro, sem mascara nenhuma.
    writeFileSync(join(dir, 'page-1.yml'), '- textbox "Senha" [ref=e24]: segredo-real\n', 'utf8');
    writeFileSync(join(dir, 'resultado.json'), '{"observado":"entrei com segredo-real"}', 'utf8');
    writeFileSync(join(dir, 'CT-01.png'), 'binario com segredo-real la dentro', 'utf8');
    mkdirSync(join(dir, 'fundo'));
    writeFileSync(join(dir, 'fundo', 'saida-crua.txt'), 'senha=segredo-real', 'utf8');
    return dir;
  }

  it('limpa os ficheiros de texto, incluindo os das subpastas', () => {
    const dir = pastaComEvidencias();
    const tocados = redigirEvidencias(dir, ['segredo-real']);
    expect(tocados).toHaveLength(3);
    expect(readFileSync(join(dir, 'page-1.yml'), 'utf8')).toContain(MARCA);
    expect(readFileSync(join(dir, 'resultado.json'), 'utf8')).toContain(MARCA);
    expect(readFileSync(join(dir, 'fundo', 'saida-crua.txt'), 'utf8')).toContain(MARCA);
  });

  // O browser mascara o campo de senha, portanto o que se ve num png sao pontinhos. Reescrever
  // um binario como utf-8 corrompia a evidencia sem ganhar nada.
  it('não toca nas capturas de ecrã', () => {
    const dir = pastaComEvidencias();
    redigirEvidencias(dir, ['segredo-real']);
    expect(readFileSync(join(dir, 'CT-01.png'), 'utf8')).toContain('segredo-real');
  });

  it('devolve lista vazia quando não havia nada a redigir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evidencias-'));
    writeFileSync(join(dir, 'page-1.yml'), 'nada aqui', 'utf8');
    expect(redigirEvidencias(dir, ['segredo-real'])).toEqual([]);
  });

  it('sem segredos declarados não percorre nada', () => {
    expect(redigirEvidencias('/pasta/que/nao/existe', [])).toEqual([]);
  });
});
