import { dentroDoNivel, NIVEL_OMISSAO } from './nivel.mjs';

const CATEGORIA_PRUDENTE = 'funcionalidade';
const GRAVIDADE_PRUDENTE = 'media';

// Um item sem etiqueta e tratado como funcionalidade de gravidade media: e o valor que o
// mantem visivel nos niveis 1 e 2 sem o promover a severo no 3. Errar para o lado de mostrar.
function classificar(item, id, avisos) {
  if (item.categoria && item.gravidade) return item;
  avisos.push(`${id}: sem categoria ou gravidade, assumido ${CATEGORIA_PRUDENTE}/${GRAVIDADE_PRUDENTE}`);
  return {
    ...item,
    categoria: item.categoria ?? CATEGORIA_PRUDENTE,
    gravidade: item.gravidade ?? GRAVIDADE_PRUDENTE,
  };
}

// Uma falha sem captura de ecra nao e uma falha: e uma afirmacao. Degrada-se para bloqueado
// antes do filtro de nivel, para acabar sempre visivel em vez de sair pela porta do
// fora_de_nivel.
function degradarSemEvidencia(caso, avisos) {
  if (caso.veredicto !== 'falha' || (caso.evidencia?.length ?? 0) > 0) return caso;
  avisos.push(`${caso.id}: falha sem evidência, degradada para bloqueado`);
  return { ...caso, veredicto: 'bloqueado' };
}

// Um caso exercido contra um equivalente aproximado nao pode sair `passa`: seria passa sobre a
// coisa errada. Vira `nao_aplicavel`, que e a divergencia documento x produto que o analista
// quer ver — e vale nos dois sentidos, porque falhar um substituto tambem nao e falhar o caso.
function forcarEquivalenteAproximado(caso, aproximadas, avisos) {
  const accao = aproximadas.get(caso.accao);
  if (!accao) return caso;
  avisos.push(`${caso.id}: exercido contra ${accao.id}, equivalente aproximado — veredicto ${caso.veredicto} convertido em nao_aplicavel`);
  const ressalva = accao.ressalva ?? `${accao.nome} trata o mesmo assunto por outro caminho`;
  return {
    ...caso,
    veredicto: 'nao_aplicavel',
    observado: [caso.observado, ressalva].filter(Boolean).join(' — '),
  };
}

function accoesAproximadas(mapa) {
  return new Map((mapa?.accoes ?? [])
    .filter((accao) => accao.equivalente_aproximado === true)
    .map((accao) => [accao.id, accao]));
}

function avisarSobreEscritas(resposta, avisos) {
  for (const insumo of resposta.insumos ?? []) {
    if (insumo.origem === 'bd' && !insumo.sql) {
      avisos.push(`insumo lido da base sem o sql — ${insumo.descricao}`);
    }
  }
  for (const registo of resposta.registos_criados ?? []) {
    if (registo.via === 'bd' && !registo.sql) {
      avisos.push(`registo escrito na base sem o sql — ${registo.descricao}`);
    }
    if (!registo.removido) {
      const razao = registo.razao ? `: ${registo.razao}` : '';
      avisos.push(`registo por limpar a mao — ${registo.descricao} ${registo.identificacao ?? ''}${razao}`.trim());
    }
  }
}

// So se filtram falhas e achados. Um `passa` conta cobertura, e um `bloqueado` ou
// `nao_aplicavel` sao o inventario do que ficou por testar: essa contabilidade tem de fechar
// igual nos tres niveis, senao duas corridas com reguas diferentes deixam de se comparar.
function filtravel(caso) {
  return caso.veredicto === 'falha';
}

export function normalizar(resposta, { nivel = NIVEL_OMISSAO, mapa = null } = {}) {
  const avisos = [];
  const aproximadas = accoesAproximadas(mapa);

  const classificados = (resposta.casos ?? [])
    .map((caso) => classificar(caso, caso.id, avisos))
    .map((caso) => forcarEquivalenteAproximado(caso, aproximadas, avisos))
    .map((caso) => degradarSemEvidencia(caso, avisos));
  const achados = (resposta.achados ?? []).map((achado) => classificar(achado, achado.titulo, avisos));

  avisarSobreEscritas(resposta, avisos);

  const foraDeNivel = [];
  const casos = classificados.filter((caso) => {
    if (!filtravel(caso) || dentroDoNivel(caso, nivel)) return true;
    avisos.push(`${caso.id}: ${caso.categoria}/${caso.gravidade} fora do nivel ${nivel}`);
    foraDeNivel.push({ tipo: 'caso', ...caso });
    return false;
  });
  const achadosDentro = achados.filter((achado) => {
    if (dentroDoNivel(achado, nivel)) return true;
    avisos.push(`achado «${achado.titulo}»: ${achado.categoria}/${achado.gravidade} fora do nivel ${nivel}`);
    foraDeNivel.push({ tipo: 'achado', ...achado });
    return false;
  });

  return {
    resposta: { ...resposta, nivel, casos, achados: achadosDentro, fora_de_nivel: foraDeNivel },
    avisos,
  };
}
