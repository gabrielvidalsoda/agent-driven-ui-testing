import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarConfigCorrida } from '../src/config.mjs';

function pastaConfig(ficheiros) {
  const dir = mkdtempSync(join(tmpdir(), 'conf-'));
  for (const [nome, conteudo] of Object.entries(ficheiros)) {
    writeFileSync(join(dir, nome), conteudo, 'utf8');
  }
  return dir;
}

const CORRIDA = 'base_url: http://localhost:4174\nnivel: 2\n';
const ALVOS = 'documentos:\n  a/b.md:\n    rota: a/b\n    sessao: a\n';
const SESSOES = 'sessoes:\n  a:\n    titulo: A\n    paralelo: false\n';

describe('carregarConfigCorrida', () => {
  it('junta os alvos, as sessoes e os insumos ao corrida.yaml', () => {
    const dir = pastaConfig({
      'corrida.yaml': CORRIDA,
      'alvos.yaml': ALVOS,
      'sessoes.yaml': SESSOES,
      'insumos.yaml': 'fontes:\n  docs: { tipo: git, url: https://exemplo/docs.git }\n',
    });
    const config = carregarConfigCorrida(join(dir, 'corrida.yaml'));
    expect(config.base_url).toBe('http://localhost:4174');
    expect(config.alvos.get('a/b.md').rota).toBe('a/b');
    expect(config.sessoes.get('a').titulo).toBe('A');
    expect(config.insumos.fontes.get('docs').url).toBe('https://exemplo/docs.git');
  });

  // O insumos.yaml e opcional: sem ele a suite corre como corria antes de os insumos existirem.
  it('carrega sem insumos.yaml', () => {
    const dir = pastaConfig({ 'corrida.yaml': CORRIDA, 'alvos.yaml': ALVOS, 'sessoes.yaml': SESSOES });
    expect(carregarConfigCorrida(join(dir, 'corrida.yaml')).insumos.fontes.size).toBe(0);
  });
});
