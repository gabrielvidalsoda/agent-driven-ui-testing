import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse } from 'yaml';
import { carregarAlvos } from './alvos.mjs';
import { carregarSessoes } from './sessoes.mjs';
import { carregarInsumos } from './insumos.mjs';
import { carregarCredenciais } from './credenciais.mjs';

// Os ficheiros de configuracao vivem todos na mesma pasta e leem-se sempre juntos. Estava
// duplicado nos dois comandos, e o insumos.yaml so entrou num deles ate isto se juntar.
//
// A pasta e a que o --config indicar, e e assim que a mesma suite corre contra varios
// produtos: `config/` para um, `config/<outro>/` para o outro, cada um com o seu conjunto
// completo. Nada aqui e global.
export function carregarConfigCorrida(caminho) {
  const cru = parse(readFileSync(caminho, 'utf8'));
  const pasta = dirname(caminho);
  return {
    ...cru,
    alvos: carregarAlvos(join(pasta, 'alvos.yaml')),
    sessoes: carregarSessoes(join(pasta, 'sessoes.yaml')),
    insumos: carregarInsumos(join(pasta, 'insumos.yaml')),
    credenciais: carregarCredenciais(join(pasta, 'credenciais.yaml')),
  };
}
