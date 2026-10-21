import Ajv from 'ajv';

const VEREDICTOS = ['passa', 'falha', 'bloqueado', 'nao_aplicavel'];
const ESTADOS = ['concluido', 'bloqueado', 'erro'];
const CONFIANCAS = ['alta', 'media', 'baixa'];

export const CATEGORIAS = ['funcionalidade', 'layout', 'estilo', 'melhoria'];
export const GRAVIDADES = ['severa', 'media', 'baixa'];
export const ORIGENS_INSUMO = ['bd', 'tela', 'documento'];

// categoria e gravidade sao opcionais de proposito. Uma resposta a que falte o campo custou o
// mesmo que uma completa; invalida-la inteira deitaria fora todos os veredictos por causa de
// uma etiqueta. Quem preenche o que falta e o normalizar, com aviso.
const CLASSIFICACAO = {
  categoria: { type: 'string', enum: CATEGORIAS },
  gravidade: { type: 'string', enum: GRAVIDADES },
};

export const ESQUEMA_RESPOSTA = {
  type: 'object',
  required: ['documento', 'estado', 'casos', 'achados'],
  additionalProperties: true,
  properties: {
    documento: { type: 'string', minLength: 1 },
    corrida: { type: 'string' },
    nivel: { type: 'integer', minimum: 1, maximum: 3 },
    estado: { type: 'string', enum: ESTADOS },
    casos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'veredicto', 'esperado', 'observado', 'evidencia'],
        properties: {
          id: { type: 'string', minLength: 1 },
          veredicto: { type: 'string', enum: VEREDICTOS },
          esperado: { type: 'string' },
          observado: { type: 'string' },
          evidencia: { type: 'array', items: { type: 'string' } },
          // A accao do mapa que este caso exerce. Vazio nos casos que o mapa nao cobre.
          accao: { type: 'string' },
          // De onde veio o esperado deste caso: a seccao do documento de cenarios ou a
          // referencia do requisito tecnico. Numa corrida sem mapa e o unico rasto que liga o
          // veredicto ao papel que o justifica -- sem ele o resultado nao se audita.
          referencia: { type: 'string' },
          ...CLASSIFICACAO,
        },
      },
    },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        required: ['titulo', 'descricao', 'confianca'],
        properties: {
          titulo: { type: 'string', minLength: 1 },
          descricao: { type: 'string' },
          reproducao: { type: 'string' },
          confianca: { type: 'string', enum: CONFIANCAS },
          evidencia: { type: 'array', items: { type: 'string' } },
          ...CLASSIFICACAO,
        },
      },
    },
    // O que o agente consumiu para poder testar. Um valor lido da base e massa real, e e o que
    // permite a quem le o relatorio repetir a consulta e confirmar que o filtro fazia sentido.
    insumos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['descricao', 'origem'],
        properties: {
          descricao: { type: 'string', minLength: 1 },
          origem: { type: 'string', enum: ORIGENS_INSUMO },
          identificacao: { type: 'string' },
          sql: { type: 'string' },
          usado_em: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    // Presta contas do que o agente escreveu na base. A base e partilhada e a massa historica
    // e irreponivel: o que ficar por remover tem de aparecer aqui para alguem limpar a mao.
    registos_criados: {
      type: 'array',
      items: {
        type: 'object',
        required: ['descricao', 'removido'],
        properties: {
          descricao: { type: 'string', minLength: 1 },
          identificacao: { type: 'string' },
          via: { type: 'string', enum: ['tela', 'bd'] },
          sql: { type: 'string' },
          removido: { type: 'boolean' },
          razao: { type: 'string' },
        },
      },
    },
    // Onde estava cada tela em que o agente trabalhou. E o de-para documento -> tela, recolhido
    // como subproduto de uma corrida que ja aterrou la: sem isto, cada corrida volta a procurar
    // pelo menu o que a anterior ja tinha encontrado.
    telas_visitadas: {
      type: 'array',
      items: {
        type: 'object',
        required: ['nome', 'url'],
        properties: {
          nome: { type: 'string', minLength: 1 },
          url: { type: 'string', minLength: 1 },
          navegacao: { type: 'string' },
        },
      },
    },
    notas_ambiente: { type: 'array', items: { type: 'string' } },
  },
};

const ajv = new Ajv({ allErrors: true });
const compilado = ajv.compile(ESQUEMA_RESPOSTA);

export function validar(objeto) {
  const valido = compilado(objeto);
  const erros = valido ? [] : compilado.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { valido, erros };
}
