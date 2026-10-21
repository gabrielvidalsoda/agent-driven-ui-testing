// O mapa continua a ser o modo normal de correr: o ambito do teste apura-se numa passagem
// barata antes de se gastar na cara. Mas ha projetos em que a documentacao tecnica das telas
// ja existe e faz esse trabalho, e aí o levantamento previo deixa de compensar. Isso e uma
// decisao de projeto, nao um esquecimento -- por isso mora na configuracao e nao numa flag que
// alguem tem de se lembrar de escrever.
export const USAR_MAPA_OMISSAO = true;

function booleano(valor, origem) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'boolean') {
    throw new Error(`usar_mapa invalido em ${origem}: ${valor} (esperado true ou false)`);
  }
  return valor;
}

// Precedencia igual a do nivel: linha de comando > alvos.yaml > corrida.yaml. Uma tela que
// precise mesmo de mapa volta a exigi-lo no alvos.yaml sem obrigar o projeto inteiro.
export function resolverUsarMapa({ cli, documento, global } = {}) {
  return booleano(cli, 'linha de comando')
    ?? booleano(documento, 'alvos.yaml')
    ?? booleano(global, 'corrida.yaml')
    ?? USAR_MAPA_OMISSAO;
}
