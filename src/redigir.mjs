import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export const MARCA = '«SENHA REDIGIDA»';

// Os despejos de pagina do Playwright MCP trazem o VALOR do campo de senha em claro: a arvore
// de acessibilidade nao mascara nada, e o ecra de entrada e a primeira coisa que o agente
// percorre. As evidencias de uma corrida vao para o git — foi assim que uma senha de
// homologacao acabou empurrada para o remoto a 2026-09-05.
//
// Por isso as evidencias passam por aqui antes de alguem as commitar. As capturas de ecra nao
// precisam: o browser mascara o campo, e o que se ve num png sao pontinhos.
const EXTENSOES = new Set(['.yml', '.yaml', '.json', '.txt', '.log', '.md', '.html']);

export function redigirTexto(texto, segredos) {
  let saida = texto;
  // Do mais comprido para o mais curto: uma senha que seja prefixo de outra tem de ser
  // substituida depois da que a contem, senao sobra metade em claro.
  for (const segredo of [...segredos].filter(Boolean).sort((a, b) => b.length - a.length)) {
    saida = saida.split(segredo).join(MARCA);
  }
  return saida;
}

export function redigirEvidencias(pasta, segredos, { ler = readFileSync, escrever = writeFileSync } = {}) {
  const uteis = [...new Set(segredos)].filter(Boolean);
  if (!uteis.length) return [];
  const tocados = [];
  for (const caminho of ficheirosDeTexto(pasta)) {
    let original;
    try {
      original = ler(caminho, 'utf8');
    } catch {
      continue;
    }
    const limpo = redigirTexto(original, uteis);
    if (limpo === original) continue;
    escrever(caminho, limpo, 'utf8');
    tocados.push(caminho);
  }
  return tocados;
}

function ficheirosDeTexto(raiz) {
  const encontrados = [];
  const visitar = (caminho) => {
    let info;
    try {
      info = statSync(caminho);
    } catch {
      return;
    }
    if (info.isDirectory()) {
      for (const entrada of readdirSync(caminho)) visitar(join(caminho, entrada));
      return;
    }
    if (EXTENSOES.has(extname(caminho).toLowerCase())) encontrados.push(caminho);
  };
  visitar(raiz);
  return encontrados;
}
