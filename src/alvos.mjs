import { readFileSync } from 'node:fs';
import { parse, stringify } from 'yaml';

function temRota(alvo) {
  return Boolean(alvo?.rota) && alvo.rota !== 'POR_PREENCHER';
}

// Nem toda a aplicacao tem rota estavel para cada tela: ha ecras que so se alcancam por dentro
// de outro (um projeto, uma factura) e cujo url leva um id que e massa de teste, nao
// configuracao. Para esses escreve-se `navegacao`: o caminho pelo menu, em portugues, que o
// agente percorre a partir da base_url. Um alvo corre com rota, com navegacao, ou com as duas.
export function corrivel(alvo) {
  return temRota(alvo) || Boolean(alvo?.navegacao);
}

// Carrega tudo, incluindo o que ainda não tem rota. A validação é preguiçosa de propósito:
// uma validação ansiosa impediria de correr um documento pronto só porque outro qualquer,
// noutra área, ainda está por preencher.
export function carregarAlvos(caminhoYaml) {
  const cru = parse(readFileSync(caminhoYaml, 'utf8'));
  const mapa = new Map();
  for (const [documento, valor] of Object.entries(cru?.documentos ?? {})) {
    mapa.set(documento, {
      rota: valor?.rota ?? 'POR_PREENCHER',
      sessao: valor?.sessao ?? documento.split('/')[0],
      escrita: Boolean(valor?.escrita),
      // Indefinido de proposito quando nao esta escrito: e o que deixa o corrida.yaml mandar.
      nivel: valor?.nivel,
      usar_mapa: valor?.usar_mapa,
      navegacao: valor?.navegacao,
      tipo_documento: valor?.tipo_documento,
    });
  }
  return mapa;
}

export function alvoDe(mapa, documento) {
  const alvo = mapa.get(documento);
  if (!alvo) throw new Error(`${documento} não está em alvos.yaml`);
  if (!corrivel(alvo)) throw new Error(`${documento}: falta a rota ou a navegação em alvos.yaml`);
  return alvo;
}

// Verificação para quem vai correr a suite completa: diz o que falta antes de gastar a noite.
export function documentosIncompletos(mapa) {
  return [...mapa.entries()].filter(([, alvo]) => !corrivel(alvo)).map(([documento]) => documento);
}

// O routes.tsx declara as rotas como filhas, sem barra inicial ('medicamentos/prestacoes').
// Aceitamos as duas formas para nao obrigar quem edita o alvos.yaml a decorar qual e.
export function urlDe(baseUrl, alvo) {
  const raiz = baseUrl.replace(/\/+$/, '');
  // Sem rota, o ponto de partida e a propria base_url e quem chega a tela e o agente, pelo
  // caminho escrito em `navegacao`.
  if (!temRota(alvo)) return raiz;
  return `${raiz}/${alvo.rota.replace(/^\/+/, '')}`;
}

export function rotasDoRouter(textoTsx) {
  return [...textoTsx.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

export function esbocarAlvos(documentos, rotas) {
  const documentosYaml = {};
  for (const { documento, sessao, escrita } of documentos) {
    const rota = sugerirRota(documento, rotas);
    documentosYaml[documento] = rota
      ? { rota, sessao, escrita }
      : { rota: 'POR_PREENCHER', sessao, escrita, candidatas: candidatasPara(documento, rotas) };
  }
  return stringify({ documentos: documentosYaml });
}

// Atalho para quem preenche as rotas a mao: as rotas que partilham pelo menos um segmento
// com o nome do documento. Sao candidatas, nao respostas — o campo e ignorado ao carregar.
function candidatasPara(documento, rotas) {
  const doDocumento = new Set(segmentos(documento.split('/').pop().replace(/\.md$/, '')));
  return rotas
    .filter((rota) => !rota.includes(':'))
    .filter((rota) => segmentos(rota).some((s) => doDocumento.has(s)))
    .sort((a, b) => a.length - b.length)
    .slice(0, 6);
}

// Uma rota com :parametro nao e navegavel sem um valor concreto, e esse valor e massa de
// teste, nao configuracao. Fica sempre POR_PREENCHER, para alguem decidir com o documento
// na mao. Entre as candidatas, a mais curta e a tela de lista, que e o ponto de entrada.
// So sugere quando os segmentos da rota sao EXATAMENTE os do nome do documento. Uma
// correspondencia por conter as palavras dava `uts-prestacoes` -> `saude-oral/prestacoes`,
// e uma sugestao errada e pior do que um branco: quem revê o alvos.yaml corrige os brancos
// e confia nos preenchidos.
function segmentos(texto) {
  return texto.split(/[/-]/).filter(Boolean);
}

function sugerirRota(documento, rotas) {
  const semExtensao = documento.replace(/\.md$/, '');
  const soNome = semExtensao.split('/').pop();
  // Duas leituras, ambas por igualdade exacta: o nome do ficheiro sozinho
  // (medicamentos-prestacoes -> medicamentos/prestacoes) e o caminho com a pasta
  // (conferencia/cockpit -> conferencia/cockpit).
  const aceites = new Set([segmentos(soNome).join('|'), segmentos(semExtensao).join('|')]);
  const candidatas = rotas
    .filter((rota) => !rota.includes(':'))
    .filter((rota) => aceites.has(segmentos(rota).join('|')))
    .sort((a, b) => a.length - b.length);
  return candidatas[0] ?? null;
}
