import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Uma fonte em pasta e documentacao que ja esta no disco de quem corre: nao ha nada a buscar,
// so a confirmar que existe. Serve os projetos cuja documentacao chega por partilha em vez de
// repositorio, e e o caminho mais barato para pôr a suite a correr contra um produto novo.
//
// A "versao" e a data de alteracao mais recente da pasta. Nao e um sha e nao finge ser: e o
// que ha, e sem ela um veredicto nao se liga a versao do papel com que foi dado.
export function sincronizarPasta(nome, fonte, { existe = existsSync, marcaDe = marcaDaArvore } = {}) {
  const caminho = resolve(fonte.url);
  if (!existe(caminho)) {
    throw new Error(`fonte ${nome}: a pasta ${caminho} nao existe`);
  }
  return { sha: marcaDe(caminho), ramo: 'pasta', url: caminho, caminho };
}

// A data mais recente de toda a arvore, em ISO. Percorrer a arvore inteira e barato ao pe de
// uma corrida, e uma marca so da pasta de topo nao mudava quando se editasse um ficheiro la
// dentro — que e exatamente o caso que interessa apanhar.
export function marcaDaArvore(raiz) {
  let maior = 0;
  const visitar = (caminho) => {
    const info = statSync(caminho);
    if (info.isDirectory()) {
      for (const entrada of readdirSync(caminho)) visitar(join(caminho, entrada));
      return;
    }
    if (info.mtimeMs > maior) maior = info.mtimeMs;
  };
  visitar(raiz);
  return new Date(maior).toISOString();
}
