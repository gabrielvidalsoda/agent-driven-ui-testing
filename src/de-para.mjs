// O de-para documento -> tela, recolhido do que as corridas já pagaram.
//
// Levantar isto com o `mapear` é lento e caro: aquilo abre a tela para inventariar as AÇÕES
// que ela entrega. Para saber ONDE a tela está basta o agente dizer onde aterrou, e ele já lá
// esteve. Sai como subproduto de uma corrida normal, sem custo nenhum a mais.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Um segmento que identifica UM registo concreto não serve de rota para ninguém: é massa de
// teste disfarçada de configuração. Reconhecem-se pela forma — só dígitos, um uuid, um hash, ou
// um id opaco comprido com letras e dígitos à mistura.
export function pareceId(segmento) {
  if (/^\d+$/.test(segmento)) return true;
  if (UUID.test(segmento)) return true;
  if (/^[0-9a-f]{12,}$/i.test(segmento)) return true;
  return segmento.length >= 16 && /\d/.test(segmento) && /[a-z]/i.test(segmento);
}

// A rota relativa à base_url, com os ids trocados por :id. A query fica de fora: é estado de
// filtro, muda a cada pesquisa, e não faz parte do endereço da tela.
export function padraoDeRota(url, baseUrl) {
  const limpo = String(url).split('#')[0].split('?')[0];
  const raiz = String(baseUrl).replace(/\/+$/, '');
  const semBase = limpo.startsWith(raiz) ? limpo.slice(raiz.length) : semDominio(limpo);
  const segmentos = semBase.split('/').filter(Boolean);
  const padrao = segmentos.map((s) => (pareceId(s) ? ':id' : s));
  return {
    rota: padrao.join('/'),
    // Uma rota parametrizada não se escreve no alvos.yaml: abri-la exige um id concreto, e esse
    // é massa de teste. Continua a valer-lhe a navegação pelo menu.
    parametrizada: padrao.some((s) => s === ':id'),
  };
}

function semDominio(url) {
  const m = url.match(/^https?:\/\/[^/]+(\/.*)?$/i);
  return m ? (m[1] ?? '') : url;
}

// Uma linha por tela visitada, com a rota já em forma de padrão. `documentos` é o que o
// recolher devolve — o mesmo formato que alimenta o relatório.
export function dePara(documentos, baseUrl) {
  const linhas = [];
  for (const doc of documentos) {
    for (const [ordem, tela] of (doc.telasVisitadas ?? []).entries()) {
      const { rota, parametrizada } = padraoDeRota(tela.url, baseUrl);
      linhas.push({
        documento: doc.documento,
        sessao: doc.sessao ?? null,
        // A primeira tela é por onde o documento se entra; as outras são cobertura do mesmo
        // documento e não candidatas a rota do alvos.yaml.
        entrada: ordem === 0,
        nome: tela.nome,
        url: tela.url,
        rota,
        parametrizada,
        navegacao: tela.navegacao ?? null,
      });
    }
  }
  return linhas;
}

export function tabelaMarkdown(linhas) {
  if (!linhas.length) return '_Nenhuma corrida registou telas visitadas._\n';
  const cabeca = '| Documento | Tela | Rota observada | Direta? | Como se lá chega |\n|---|---|---|---|---|\n';
  const corpo = linhas
    .map((l) => [
      l.entrada ? `**${l.documento}**` : `↳ ${l.documento}`,
      l.nome,
      `\`${l.rota || '/'}\``,
      l.parametrizada ? 'não, leva id' : 'sim',
      l.navegacao ?? '—',
    ].join(' | '))
    .map((linha) => `| ${linha} |`)
    .join('\n');
  return `${cabeca}${corpo}\n`;
}

// O bloco pronto a colar no alvos.yaml. Deliberadamente NÃO reescreve o ficheiro: uma rota
// errada escrita em silêncio é pior do que um branco, porque quem revê o alvos.yaml corrige os
// brancos e confia no que lá está preenchido.
export function sugestaoAlvos(linhas) {
  const entradas = linhas.filter((l) => l.entrada);
  if (!entradas.length) return '';
  const blocos = entradas.map((l) => {
    if (!l.parametrizada) {
      return `  ${l.documento}:\n    rota: ${l.rota}   # observada na corrida: ${l.url}`;
    }
    const nav = l.navegacao ?? '(a corrida não disse)';
    return `  ${l.documento}:\n    # a tela vive em ${l.rota} — o id é massa de teste, não configuração\n    navegacao: ${nav}`;
  });
  return `documentos:\n${blocos.join('\n')}\n`;
}
