// Uso: node src/gerar-alvos.mjs > config/alvos.yaml
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rotasDoRouter, esbocarAlvos } from './alvos.mjs';

const RAIZ_CENARIOS = '../ccmsns_docs/_cenarios_teste';
const ROUTER = '../ccmsns-novo/ccmsns-ui/src/router/routes.tsx';
const ESCRITA = /\b(gravar|guardar|submeter|aprovar|rejeitar|criar|inserir|eliminar|apagar|encerrar|disparar|associar|anular)/i;

function documentosDeCenario(raiz) {
  const encontrados = [];
  for (const entrada of readdirSync(raiz)) {
    const caminho = join(raiz, entrada);
    if (statSync(caminho).isDirectory()) {
      if (entrada === 'poc-automacao') continue;
      encontrados.push(...documentosDeCenario(caminho));
    } else if (entrada.endsWith('.md') && entrada !== 'README.md') {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

const rotas = rotasDoRouter(readFileSync(ROUTER, 'utf8'));
const documentos = documentosDeCenario(RAIZ_CENARIOS).map((caminho) => {
  const documento = relative(RAIZ_CENARIOS, caminho).replaceAll('\\', '/');
  return {
    documento,
    sessao: documento.split('/')[0],
    escrita: ESCRITA.test(readFileSync(caminho, 'utf8')),
  };
});

process.stdout.write(esbocarAlvos(documentos, rotas));
