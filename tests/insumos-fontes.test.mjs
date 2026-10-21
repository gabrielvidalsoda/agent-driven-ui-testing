import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { carregarInsumos } from '../src/insumos.mjs';
import { sincronizar } from '../src/insumos-fontes.mjs';

function configDe(texto) {
  const dir = mkdtempSync(join(tmpdir(), 'insumos-git-'));
  const caminho = join(dir, 'insumos.yaml');
  writeFileSync(caminho, texto, 'utf8');
  return carregarInsumos(caminho);
}

const UMA_FONTE = `
fontes:
  docs:
    tipo: git
    url: https://exemplo/docs.git
    ramo: main
`;

// Um git falso que regista o que lhe pediram: e assim que se prova a sequencia de comandos
// sem depender de rede nem de credenciais.
function gitFalso({ sha = 'abc1234', codigo = 0, saida = '' } = {}) {
  const chamadas = [];
  const correr = (args, opcoes) => {
    chamadas.push({ args, ...opcoes });
    if (args.includes('rev-parse')) return { codigo: 0, saida: `${sha}\n` };
    return { codigo, saida };
  };
  return { correr, chamadas };
}

function cacheVazia() {
  return mkdtempSync(join(tmpdir(), 'cache-'));
}

describe('sincronizar', () => {
  it('clona a fonte quando ainda nao esta na cache', () => {
    const raizCache = cacheVazia();
    const git = gitFalso();
    sincronizar(configDe(UMA_FONTE), { raizCache, correr: git.correr });
    expect(git.chamadas[0].args).toEqual([
      'clone', '--depth', '1', '--branch', 'main', 'https://exemplo/docs.git', join(raizCache, 'docs'),
    ]);
  });

  it('atualiza a fonte que ja esta na cache em vez de a clonar', () => {
    const raizCache = cacheVazia();
    mkdirSync(join(raizCache, 'docs', '.git'), { recursive: true });
    const git = gitFalso();
    sincronizar(configDe(UMA_FONTE), { raizCache, correr: git.correr });
    const feitos = git.chamadas.map((c) => c.args[0]);
    expect(feitos).not.toContain('clone');
    expect(feitos).toEqual(['fetch', 'reset', 'rev-parse']);
  });

  // O sha e o que torna a corrida reproduzivel: sem ele nao se sabe contra que versao do
  // requisito o agente deu os veredictos.
  it('devolve o sha e o ramo de cada fonte', () => {
    const raizCache = cacheVazia();
    const git = gitFalso({ sha: 'e115218' });
    const versoes = sincronizar(configDe(UMA_FONTE), { raizCache, correr: git.correr });
    expect(versoes.get('docs')).toEqual({
      sha: 'e115218', ramo: 'main', url: 'https://exemplo/docs.git', caminho: join(raizCache, 'docs'),
    });
  });

  it('nao vai a rede quando atualizar e falso e a cache ja existe', () => {
    const raizCache = cacheVazia();
    mkdirSync(join(raizCache, 'docs', '.git'), { recursive: true });
    const git = gitFalso();
    sincronizar(configDe(`atualizar: false\n${UMA_FONTE}`), { raizCache, correr: git.correr });
    expect(git.chamadas.map((c) => c.args[0])).toEqual(['rev-parse']);
  });

  it('rebenta quando atualizar e falso e a cache nao existe', () => {
    const git = gitFalso();
    expect(() => sincronizar(configDe(`atualizar: false\n${UMA_FONTE}`), { raizCache: cacheVazia(), correr: git.correr }))
      .toThrow(/docs.*atualizar/s);
  });

  // O formato aceita `tipo` para o Confluence entrar depois sem o mudar. Enquanto nao entrar,
  // tem de recusar em voz alta, nunca em silencio.
  it('recusa um tipo de fonte que ainda nao sabe buscar', () => {
    const config = configDe(`
fontes:
  wiki:
    tipo: confluence
    url: https://spms.atlassian.net/wiki
`);
    expect(() => sincronizar(config, { raizCache: cacheVazia(), correr: gitFalso().correr }))
      .toThrow(/wiki.*confluence.*nao suportado/s);
  });

  it('rebenta com a saida do git quando o comando falha', () => {
    const git = gitFalso({ codigo: 128, saida: 'fatal: Authentication failed' });
    expect(() => sincronizar(configDe(UMA_FONTE), { raizCache: cacheVazia(), correr: git.correr }))
      .toThrow(/Authentication failed/);
  });
});
