export const NIVEL_OMISSAO = 2;

// A regua de severidade da corrida. 1 ve tudo e sugere melhorias, 2 ve o que esta partido,
// 3 ve so o que impede alguem de trabalhar.
const REGUAS = {
  1: () => true,
  2: ({ categoria }) => categoria === 'funcionalidade' || categoria === 'layout',
  3: ({ categoria, gravidade }) => categoria === 'funcionalidade' && gravidade === 'severa',
};

function numero(valor, origem) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || !(n in REGUAS)) {
    throw new Error(`nivel invalido em ${origem}: ${valor} (esperado 1, 2 ou 3)`);
  }
  return n;
}

// Precedencia: quem escreve o comando manda sobre o que esta no alvos.yaml, que por sua vez
// manda sobre o corrida.yaml. Uma area critica fica em nivel 1 no alvos.yaml sem obrigar a
// noite inteira a esse custo.
export function resolverNivel({ cli, documento, global } = {}) {
  return numero(cli, 'linha de comando')
    ?? numero(documento, 'alvos.yaml')
    ?? numero(global, 'corrida.yaml')
    ?? NIVEL_OMISSAO;
}

export function dentroDoNivel({ categoria, gravidade }, nivel) {
  return REGUAS[nivel]({ categoria, gravidade });
}
