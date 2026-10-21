import Ajv from 'ajv';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse, stringify } from 'yaml';

const TIPOS_ACCAO = ['consulta', 'filtro', 'criacao', 'edicao', 'remocao', 'navegacao', 'exportacao'];
const OBTIVEL = ['tela', 'bd', 'nao'];
const RESULTADOS_REPESCAGEM = ['nao_existe', 'encontrado'];
// Gravado no mapa ha um terceiro estado, que o agente nao pode declarar: o `encontrado` que
// veio sem captura. Nao e conclusao dele, e o que o mapa faz de uma afirmacao por provar.
const RESULTADOS_NO_MAPA = [...RESULTADOS_REPESCAGEM, 'encontrado_sem_prova'];

const ITEM_ACCAO = {
  type: 'object',
  required: ['id', 'tipo', 'nome', 'como', 'promessa'],
  properties: {
    id: { type: 'string', minLength: 1 },
    tipo: { type: 'string', enum: TIPOS_ACCAO },
    nome: { type: 'string', minLength: 1 },
    como: { type: 'string', minLength: 1 },
    // O que a TELA promete: rotulo do botao, cabecalho da grelha, texto de ajuda. E o
    // esperado de recurso para as accoes que nenhum CT-nn cobre.
    promessa: { type: 'string', minLength: 1 },
    // Preenchido so quando a accao vive noutra tela da mesma seccao de menu. Em branco
    // significa a rota do proprio documento.
    rota: { type: 'string' },
    entradas: {
      type: 'array',
      items: {
        type: 'object',
        required: ['campo'],
        properties: {
          campo: { type: 'string', minLength: 1 },
          obrigatorio: { type: 'boolean' },
          origem_valores: { type: 'string' },
        },
      },
    },
    casos_documento: { type: 'array', items: { type: 'string' } },
    // A accao trata o mesmo assunto, mas por outro caminho ou noutro momento do fluxo: serve
    // de pista, nao cumpre o caso. Quem a marca e a repescagem; quem a faz valer e o
    // normalizar, que forca o veredicto a nao_aplicavel.
    equivalente_aproximado: { type: 'boolean' },
    ressalva: { type: 'string' },
  },
};

const ITEM_INSUMO = {
  type: 'object',
  required: ['descricao', 'obtivel'],
  properties: {
    descricao: { type: 'string', minLength: 1 },
    obtivel: { type: 'string', enum: OBTIVEL },
    razao: { type: 'string' },
  },
};

// A repescagem e a segunda passagem do mapeamento: volta ao que ficou por encontrar e procura
// a mesma coisa com outro nome, noutro sitio, ou noutra tela da mesma seccao de menu. O que
// interessa guardar nao e so a conclusao — e o que foi procurado e onde, para um
// `nao_aplicavel` deixar de ser afirmacao do agente e passar a conclusao auditavel.
const REPESCAGEM_NO_MAPA = {
  type: 'object',
  properties: {
    feita_em: { type: 'string' },
    alvos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['alvo', 'procurei', 'onde', 'resultado'],
        properties: {
          alvo: { type: 'string', minLength: 1 },
          procurei: { type: 'array', items: { type: 'string' } },
          onde: { type: 'array', items: { type: 'string' } },
          resultado: { type: 'string', enum: RESULTADOS_NO_MAPA },
          accao: { type: ['string', 'null'] },
          // Fica quando o agente diz ter encontrado mas nao provou: a accao que ele alegou
          // nao entra no mapa, mas o revisor tem de saber qual era para a poder confirmar.
          accao_alegada: { type: ['string', 'null'] },
          captura: { type: 'string' },
          equivalente_aproximado: { type: 'boolean' },
          nota: { type: 'string' },
        },
      },
    },
  },
};

export const ESQUEMA_MAPA = {
  type: 'object',
  required: ['documento', 'rota', 'mapeado_em', 'accoes'],
  additionalProperties: true,
  properties: {
    documento: { type: 'string', minLength: 1 },
    rota: { type: 'string', minLength: 1 },
    mapeado_em: { type: 'string', minLength: 1 },
    mapeado_contra: { type: 'object', additionalProperties: true },
    accoes: { type: 'array', items: ITEM_ACCAO },
    insumos_necessarios: { type: 'array', items: ITEM_INSUMO },
    // Os CT-nn do documento sem accao correspondente na tela. Nao sao bloqueios: sao
    // divergencia entre o desenho e o produto, e e para o analista que vao.
    casos_sem_accao: { type: 'array', items: { type: 'string' } },
    repescagem: REPESCAGEM_NO_MAPA,
  },
};

// O que a segunda passagem devolve. Difere do que fica gravado num ponto: aqui `accao` e a
// accao inteira, para poder entrar no mapa; gravada, fica so o id, para o mapa nao a repetir.
export const ESQUEMA_REPESCAGEM = {
  type: 'object',
  required: ['documento', 'alvos'],
  additionalProperties: true,
  properties: {
    documento: { type: 'string', minLength: 1 },
    feita_em: { type: 'string' },
    alvos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['alvo', 'procurei', 'onde', 'resultado'],
        properties: {
          alvo: { type: 'string', minLength: 1 },
          procurei: { type: 'array', items: { type: 'string' } },
          onde: { type: 'array', items: { type: 'string' } },
          resultado: { type: 'string', enum: RESULTADOS_REPESCAGEM },
          accao: ITEM_ACCAO,
          // Ficheiro da captura que mostra o elemento no ecra. Sem ela um `encontrado` nao
          // e acreditado: ver fundirRepescagem.
          captura: { type: 'string' },
          // O que se achou trata o mesmo assunto mas nao e a mesma accao do caso.
          equivalente_aproximado: { type: 'boolean' },
          // Quando o alvo era um insumo e afinal ha forma de o obter.
          obtivel: { type: 'string', enum: OBTIVEL },
          nota: { type: 'string' },
        },
      },
    },
  },
};

const ajv = new Ajv({ allErrors: true });
const compilado = ajv.compile(ESQUEMA_MAPA);
const compiladoRepescagem = ajv.compile(ESQUEMA_REPESCAGEM);

function resultado(valida, objeto) {
  const valido = valida(objeto);
  const erros = valido ? [] : valida.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { valido, erros };
}

export function validarMapa(objeto) {
  return resultado(compilado, objeto);
}

export function validarRepescagem(objeto) {
  return resultado(compiladoRepescagem, objeto);
}

export function caminhoMapa(pastaMapas, documento) {
  return join(pastaMapas, documento.replace(/\.md$/, '.yaml'));
}

export function existeMapa(caminho) {
  return existsSync(caminho);
}

export function lerMapa(caminho) {
  if (!existsSync(caminho)) {
    throw new Error(`falta o mapa ${caminho}: correr «npm run mapear -- <documento>» antes de testar`);
  }
  const mapa = parse(readFileSync(caminho, 'utf8'));
  const { valido, erros } = validarMapa(mapa);
  if (!valido) throw new Error(`${caminho} fora do esquema: ${erros.join('; ')}`);
  return mapa;
}

export function escreverMapa(caminho, mapa) {
  const { valido, erros } = validarMapa(mapa);
  if (!valido) throw new Error(`mapa fora do esquema, nada foi escrito: ${erros.join('; ')}`);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, stringify(mapa), 'utf8');
  return caminho;
}

// Cobertura: uma accao mapeada que nenhum caso exerceu e trabalho por fazer, nao defeito.
// Aceita o id do caso a valer pelo da accao, porque as accoes sem CT-nn sao numeradas A<nn>.
export function accoesNaoExercidas(mapa, resposta) {
  const exercidas = new Set((resposta?.casos ?? []).flatMap((caso) => [caso.accao, caso.id].filter(Boolean)));
  return mapa.accoes.filter((accao) => !exercidas.has(accao.id)).map((accao) => accao.id);
}

// O que a segunda passagem vai caçar: o que a primeira nao encontrou na tela, e a massa que
// declarou impossivel de obter. Vazio significa que nao ha nada a repescar e a passagem nao
// chega a correr — nao se paga um agente para confirmar que esta tudo bem.
export function alvosDeRepescagem(mapa) {
  return [
    ...(mapa.casos_sem_accao ?? []).map((caso) => ({ alvo: caso, tipo: 'caso' })),
    ...(mapa.insumos_necessarios ?? [])
      .filter((insumo) => insumo.obtivel === 'nao')
      .map((insumo) => ({ alvo: insumo.descricao, tipo: 'insumo', razao: insumo.razao })),
  ];
}

// Funde o que a repescagem achou de volta no mapa. O que foi encontrado deixa de ser
// divergencia e passa a accao testavel; o que nao foi fica na mesma, mas agora com a prova do
// que se procurou.
export function fundirRepescagem(mapa, repescagem) {
  const accoes = [...mapa.accoes];
  const semAccao = new Set(mapa.casos_sem_accao ?? []);
  const insumos = (mapa.insumos_necessarios ?? []).map((i) => ({ ...i }));
  const alvos = [];

  for (const item of repescagem.alvos ?? []) {
    // Um equivalente aproximado entra como pista e nao cumpre o caso: nem o tira de
    // casos_sem_accao, nem promove o insumo. Em `associacao-caixa` o CT-07 e o CT-08 foram
    // ligados a accoes do ecra /arquivo que tratam o mesmo assunto noutro momento do fluxo; o
    // agente escreveu a ressalva, mas nada a fazia valer.
    const aproximado = item.equivalente_aproximado === true;
    // Um `encontrado` so conta com captura. A repescagem de 19/08 deu tres casos por
    // encontrados a partir do codigo-fonte, com a listagem vazia no ambiente; o enunciado ja
    // o proibia, mas nada o travava. Sem prova a afirmacao fica registada e nao promove nada:
    // o caso continua por cobrir, que e a verdade, em vez de virar teste sobre nada.
    const provou = typeof item.captura === 'string' && item.captura.trim() !== '';
    const alegou = item.resultado === 'encontrado';
    const achou = alegou && provou;
    if (achou && item.accao) {
      accoes.push(aproximado
        ? { ...item.accao, equivalente_aproximado: true, ...(item.nota ? { ressalva: item.nota } : {}) }
        : item.accao);
      if (!aproximado) {
        semAccao.delete(item.alvo);
        for (const caso of item.accao.casos_documento ?? []) semAccao.delete(caso);
      }
    }
    if (achou && !aproximado) {
      const insumo = insumos.find((i) => i.descricao === item.alvo);
      if (insumo) {
        insumo.obtivel = item.obtivel ?? 'tela';
        insumo.razao = item.nota ?? insumo.razao;
      }
    }
    const semProva = alegou && !provou;
    const nota = semProva
      ? [item.nota, 'encontrado sem captura: afirmacao por confirmar a mao'].filter(Boolean).join(' — ')
      : item.nota;
    alvos.push({
      alvo: item.alvo,
      procurei: item.procurei ?? [],
      onde: item.onde ?? [],
      resultado: semProva ? 'encontrado_sem_prova' : item.resultado,
      accao: achou && item.accao ? item.accao.id : null,
      ...(semProva && item.accao ? { accao_alegada: item.accao.id } : {}),
      ...(achou && aproximado ? { equivalente_aproximado: true } : {}),
      ...(provou && item.captura ? { captura: item.captura } : {}),
      ...(nota ? { nota } : {}),
    });
  }

  return {
    ...mapa,
    accoes,
    insumos_necessarios: insumos,
    casos_sem_accao: [...semAccao],
    repescagem: { feita_em: repescagem.feita_em ?? mapa.mapeado_em, alvos },
  };
}
