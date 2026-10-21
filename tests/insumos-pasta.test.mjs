import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarInsumos, caminhoDeRef } from '../src/insumos.mjs';
import { sincronizar } from '../src/insumos-fontes.mjs';
import { marcaDaArvore } from '../src/insumos-pasta.mjs';

function configDe(texto) {
  const dir = mkdtempSync(join(tmpdir(), 'insumos-pasta-'));
  const caminho = join(dir, 'insumos.yaml');
  writeFileSync(caminho, texto, 'utf8');
  return carregarInsumos(caminho);
}

function pastaComDoc(nome = 'guia.md') {
  const dir = mkdtempSync(join(tmpdir(), 'docs-'));
  writeFileSync(join(dir, nome), '# guia\n', 'utf8');
  return dir;
}

describe('fonte em pasta', () => {
  it('não vai buscar nada: confirma que a pasta existe e devolve-a', () => {
    const dir = pastaComDoc();
    const versoes = sincronizar(configDe(`fontes:\n  docs:\n    tipo: pasta\n    url: ${dir.replaceAll('\\', '/')}\n`), {
      raizCache: mkdtempSync(join(tmpdir(), 'cache-')),
    });
    expect(versoes.get('docs').caminho).toBe(resolve(dir));
    expect(versoes.get('docs').ramo).toBe('pasta');
  });

  it('rebenta quando a pasta declarada não existe', () => {
    const config = configDe('fontes:\n  docs:\n    tipo: pasta\n    url: ./nao-existe-de-certeza\n');
    expect(() => sincronizar(config, { raizCache: mkdtempSync(join(tmpdir(), 'cache-')) }))
      .toThrow(/docs.*nao existe/s);
  });

  // Uma fonte em pasta ja esta no disco de quem corre: copia-la para a cache criaria uma
  // segunda verdade, e alguem acabaria a editar a copia.
  it('lê o insumo da pasta original e não da cache', () => {
    const dir = pastaComDoc('padroes.md');
    const config = configDe(`fontes:\n  docs:\n    tipo: pasta\n    url: ${dir.replaceAll('\\', '/')}\n`);
    expect(caminhoDeRef(config, 'docs:padroes.md', '/cache/qualquer'))
      .toBe(join(resolve(dir), 'padroes.md'));
  });

  it('uma fonte git continua a ler-se de dentro da cache', () => {
    const config = configDe('fontes:\n  docs:\n    tipo: git\n    url: https://exemplo/docs.git\n');
    expect(caminhoDeRef(config, 'docs:a/b.md', '/cache')).toBe(join('/cache', 'docs', 'a', 'b.md'));
  });
});

describe('marcaDaArvore', () => {
  // A marca e o que liga um veredicto a versao do papel com que foi dado. Uma marca so da
  // pasta de topo nao mexia quando se editasse um ficheiro la dentro — o caso que interessa.
  it('acompanha o ficheiro mais recente, mesmo em subpasta', () => {
    const dir = pastaComDoc();
    mkdirSync(join(dir, 'sub'));
    const fundo = join(dir, 'sub', 'novo.md');
    writeFileSync(fundo, 'x', 'utf8');
    const futuro = new Date('2030-01-02T03:04:05Z');
    utimesSync(fundo, futuro, futuro);
    expect(marcaDaArvore(dir)).toBe(futuro.toISOString());
  });
});
