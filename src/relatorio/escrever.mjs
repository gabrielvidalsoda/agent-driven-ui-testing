import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recolherDia } from './recolher.mjs';
import { htmlSessao, htmlIndice } from './html.mjs';

// Escrever é o único passo com efeitos: recolher e html são puros e testam-se sem disco.
export function escreverRelatorios(raizCorridas, data, titulos = new Map(), apenasSessao = null) {
  const modelo = recolherDia(raizCorridas, data, titulos);
  const alvo = apenasSessao ? modelo.sessoes.filter((s) => s.id === apenasSessao) : modelo.sessoes;

  if (apenasSessao && alvo.length === 0) {
    throw new Error(`a sessão ${apenasSessao} não tem pasta em ${join(raizCorridas, data)}`);
  }

  const escritos = alvo.map((sessao) => {
    const caminho = join(raizCorridas, data, sessao.id, 'relatorio.html');
    writeFileSync(caminho, htmlSessao(sessao, data), 'utf8');
    return caminho;
  });

  // O índice conta sempre o dia inteiro, mesmo quando se regenera uma sessão só — senão uma
  // regeneração parcial apagava as outras da vista de topo.
  const indice = join(raizCorridas, data, 'index.html');
  writeFileSync(indice, htmlIndice(modelo), 'utf8');

  return { indice, sessoes: escritos, modelo };
}
