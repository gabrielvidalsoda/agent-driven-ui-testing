// O menu do front é a autoridade sobre que áreas existem: está declarado no produto, ao
// contrário da pasta do documento, que era convenção nossa. Lê-se por expressão regular,
// como as rotas do router — não é um parser de TypeScript e não precisa de ser.
export function seccoesDoMenu(textoTsx) {
  const corpo = extrairMenuItems(textoTsx);
  return blocosDeTopo(corpo).map((bloco) => ({
    id: primeiroValor(bloco, '_id'),
    titulo: primeiroValor(bloco, 'title'),
    // A raiz '/' não é rota de tela nenhuma e não serve de alvo.
    urls: [...bloco.matchAll(/url:\s*'([^']+)'/g)]
      .map((m) => m[1].replace(/^\/+/, ''))
      .filter(Boolean),
  }));
}

function extrairMenuItems(textoTsx) {
  const inicio = textoTsx.indexOf('const menuItems');
  if (inicio < 0) throw new Error('não encontrei o menuItems no ficheiro do menu');
  // A partir do `=`, e não da declaração: a anotação de tipo `MenuEntry[]` traz um par de
  // parênteses rectos vazio que seria tomado pelo início do array.
  const abre = textoTsx.indexOf('[', textoTsx.indexOf('=', inicio));
  return textoTsx.slice(abre + 1, fechoDoArray(textoTsx, abre));
}

// Varre a contar parênteses rectos para achar o fecho do array de topo. Um `indexOf('];')`
// ingénuo pararia no primeiro grupo de filhos.
function fechoDoArray(texto, abre) {
  let profundidade = 0;
  for (let i = abre; i < texto.length; i += 1) {
    if (texto[i] === '[') profundidade += 1;
    if (texto[i] === ']') {
      profundidade -= 1;
      if (profundidade === 0) return i;
    }
  }
  throw new Error('o array do menu não fecha');
}

// Corta o corpo do array nos elementos de primeiro nível, contando chavetas.
function blocosDeTopo(corpo) {
  const blocos = [];
  let profundidade = 0;
  let inicio = -1;
  for (let i = 0; i < corpo.length; i += 1) {
    if (corpo[i] === '{') {
      if (profundidade === 0) inicio = i;
      profundidade += 1;
    }
    if (corpo[i] === '}') {
      profundidade -= 1;
      if (profundidade === 0) blocos.push(corpo.slice(inicio, i + 1));
    }
  }
  return blocos;
}

function primeiroValor(bloco, campo) {
  return bloco.match(new RegExp(`${campo}:\\s*'([^']*)'`))?.[1] ?? null;
}
