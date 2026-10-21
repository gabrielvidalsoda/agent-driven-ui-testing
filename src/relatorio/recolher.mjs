import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const VEREDICTOS = ['passa', 'falha', 'bloqueado', 'nao_aplicavel'];

// A pasta é a fonte da verdade, não o sessao.json. Uma corrida retomada reescreve o sessao.json
// com a segunda metade e perde os documentos da primeira — foi o que aconteceu a 2026-08-18, que
// ficou com 4 dos 9. Os resultado.json por documento nunca se perdem, por isso é deles que se lê;
// o sessao.json entra só para o que não existe em lado nenhum: estado, razão e o que ficou por
// correr.
export function recolherDia(raizCorridas, data, titulos = new Map()) {
  const raizData = join(raizCorridas, data);
  if (!existsSync(raizData)) throw new Error(`não existe corrida para ${data} em ${raizCorridas}`);

  const sessoes = subpastas(raizData)
    .map((id) => recolherSessao(raizData, id, titulos))
    .filter((s) => s.documentos.length > 0 || s.estado);

  return { data, sessoes, contagens: somarContagens(sessoes), metricas: somarMetricas(sessoes) };
}

export function recolherSessao(raizData, id, titulos = new Map()) {
  const pasta = join(raizData, id);
  const meta = lerSessaoJson(pasta);

  const documentos = subpastas(pasta)
    .map((doc) => recolherDocumento(pasta, doc))
    .filter(Boolean)
    .map((doc) => ({ ...doc, sessao: id }));

  return {
    id,
    titulo: titulos.get(id)?.titulo ?? id,
    estado: meta.estado,
    razao: meta.razao,
    porCorrer: meta.porCorrer,
    documentos,
    contagens: somarContagens(documentos),
    metricas: somarMetricas(documentos),
  };
}

function recolherDocumento(pastaSessao, id) {
  const pasta = join(pastaSessao, id);
  const caminho = join(pasta, 'resultado.json');
  if (!existsSync(caminho)) return null;

  const cru = lerJson(caminho);
  if (!cru) return null;
  const resposta = cru.resposta ?? {};
  const capturas = new Set(ficheiros(pasta).filter((f) => f.toLowerCase().endsWith('.png')));

  const casos = (resposta.casos ?? []).map((c) => ({
    id: c.id ?? '(sem id)',
    veredicto: normalizarVeredicto(c.veredicto),
    esperado: c.esperado ?? '',
    observado: c.observado ?? '',
    // Só as capturas que existem mesmo em disco: uma evidência anunciada e ausente daria um
    // <img> partido no relatório, e o relatório é para se confiar.
    evidencia: (c.evidencia ?? []).filter((f) => capturas.has(f)).map((f) => `${id}/${f}`),
  }));

  return {
    id,
    documento: resposta.documento ?? id,
    estado: cru.estado ?? resposta.estado ?? 'desconhecido',
    casos,
    achados: resposta.achados ?? [],
    registos: resposta.registos_criados ?? [],
    notasAmbiente: resposta.notas_ambiente ?? [],
    // Nao entra no relatorio HTML: serve o de-para documento -> tela, que se le da mesma pasta.
    telasVisitadas: resposta.telas_visitadas ?? [],
    avisos: cru.avisos ?? [],
    metricas: cru.metricas ?? {},
    contagens: contarVeredictos(casos),
  };
}

// Um veredicto fora do vocabulário conta como bloqueado em vez de desaparecer da soma: um caso
// que não se sabe classificar não é um caso que passou.
function normalizarVeredicto(valor) {
  return VEREDICTOS.includes(valor) ? valor : 'bloqueado';
}

export function contarVeredictos(casos) {
  const contagens = Object.fromEntries(VEREDICTOS.map((v) => [v, 0]));
  for (const caso of casos) contagens[caso.veredicto] += 1;
  return { ...contagens, total: casos.length };
}

function somarContagens(itens) {
  const contagens = Object.fromEntries(VEREDICTOS.map((v) => [v, 0]));
  let total = 0;
  for (const item of itens) {
    for (const v of VEREDICTOS) contagens[v] += item.contagens?.[v] ?? 0;
    total += item.contagens?.total ?? 0;
  }
  return { ...contagens, total };
}

function somarMetricas(itens) {
  const soma = { duracaoMs: 0, custoUsd: 0, tokensEntrada: 0, tokensSaida: 0 };
  for (const item of itens) {
    for (const chave of Object.keys(soma)) soma[chave] += item.metricas?.[chave] ?? 0;
  }
  return soma;
}

function lerSessaoJson(pasta) {
  const caminho = join(pasta, 'sessao.json');
  if (!existsSync(caminho)) return { estado: null, razao: null, porCorrer: [] };
  const cru = lerJson(caminho);
  return {
    estado: cru?.estado ?? null,
    razao: cru?.razao ?? null,
    porCorrer: cru?.porCorrer ?? cru?.por_correr ?? [],
  };
}

// Um resultado.json truncado (corrida morta a meio da escrita) não pode derrubar o relatório
// inteiro — o documento fica de fora e os outros continuam a contar.
function lerJson(caminho) {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

function subpastas(raiz) {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function ficheiros(raiz) {
  return readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
}
