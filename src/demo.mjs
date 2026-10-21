import { normalizar } from './normalizar.mjs';
import { accoesNaoExercidas } from './mapa.mjs';
import { validar } from './esquema.mjs';

// Uma resposta de agente gravada, contra o mapa real de associacao-caixa. Cada caso existe
// para exercer uma regra do normalizar: a classificacao em falta, a falha sem prova, o
// equivalente aproximado, e as tres reguas de severidade. Nao substitui uma corrida — serve
// para mostrar a maquina a decidir sem esperar por um agente nem pagar por ele.
export const RESPOSTA_GRAVADA = {
  documento: 'gestao-armazem/associacao-caixa.md',
  corrida: '2026-08-18',
  estado: 'concluido',
  casos: [
    {
      id: 'CT-01',
      accao: 'abrir-caixa',
      veredicto: 'passa',
      categoria: 'funcionalidade',
      gravidade: 'media',
      esperado: 'Abrir caixa com codigo valido cria a caixa em Em associacao',
      observado: 'Caixa C24035 aberta, estado Em associacao, operador na linha',
      evidencia: ['CT-01_caixa_aberta.png'],
    },
    {
      id: 'CT-09',
      accao: 'pesquisar-listagem',
      veredicto: 'falha',
      categoria: 'funcionalidade',
      gravidade: 'severa',
      esperado: 'Codigo de caixa inexistente devolve mensagem de nao encontrado',
      observado: 'A API devolveu 500 e o ecra ficou em branco, sem mensagem',
      evidencia: ['CT-09_500_ao_abrir_caixa.png'],
    },
    {
      id: 'CT-10',
      accao: 'filtrar-estado-associacao',
      veredicto: 'falha',
      categoria: 'layout',
      gravidade: 'media',
      esperado: 'O filtro de estado mantem o rotulo visivel com a lista aberta',
      observado: 'A lista de opcoes tapa o rotulo do proprio filtro',
      evidencia: ['CT-10_rotulo_tapado.png'],
    },
    {
      id: 'CT-11',
      accao: 'filtrar-pedido-pagamento',
      veredicto: 'falha',
      categoria: 'estilo',
      gravidade: 'baixa',
      esperado: 'O filtro PP alinha com os restantes filtros da barra',
      observado: 'Fica 4px acima dos outros',
      evidencia: ['CT-11_alinhamento.png'],
    },
    {
      id: 'CT-14',
      accao: 'exportar-xlsx-listagem',
      veredicto: 'falha',
      categoria: 'funcionalidade',
      gravidade: 'severa',
      esperado: 'A exportacao devolve as linhas filtradas',
      observado: 'O ficheiro veio vazio',
      evidencia: [],
    },
    {
      id: 'CT-07',
      accao: 'corrigir-factura-lotes-observacoes',
      veredicto: 'passa',
      categoria: 'funcionalidade',
      gravidade: 'media',
      esperado: 'Divergencia de lotes fisicos e registada ao completar a fatura na caixa',
      observado: 'Corrigi os lotes pelo ecra /arquivo e o valor gravou',
      evidencia: ['CT-07_lotes_corrigidos.png'],
    },
    {
      id: 'CT-02',
      veredicto: 'nao_aplicavel',
      esperado: 'Localizar prestador com uma unica fatura sem incidencia',
      observado: 'A tela nao entrega esta accao; a repescagem procurou em 9 telas da seccao',
      evidencia: [],
    },
  ],
  achados: [
    {
      titulo: 'Abrir caixa com codigo inexistente devolve 500',
      descricao: 'O endpoint responde 500 em vez de 404, e a SPA nao trata o erro',
      reproducao: 'Abrir caixa com o codigo ZZZZZZ',
      categoria: 'funcionalidade',
      gravidade: 'severa',
      confianca: 'alta',
      evidencia: ['achado_500.png'],
    },
    {
      titulo: 'A grelha ganhava com uma coluna de data de abertura',
      descricao: 'Hoje so se sabe a data abrindo a caixa uma a uma',
      confianca: 'media',
      categoria: 'melhoria',
      gravidade: 'baixa',
      evidencia: [],
    },
  ],
  insumos: [
    {
      descricao: 'Caixa em estado Aguardando preparacao',
      origem: 'bd',
      identificacao: 'C24035',
      usado_em: ['CT-01'],
    },
  ],
  registos_criados: [
    {
      descricao: 'Caixa de teste aberta pelo agente',
      identificacao: 'C24035',
      via: 'tela',
      removido: false,
      razao: 'a aplicacao nao tem accao de eliminar caixa',
    },
  ],
  notas_ambiente: ['a listagem demorou 12s a carregar na primeira abertura'],
};

function contar(casos, veredicto) {
  return casos.filter((caso) => caso.veredicto === veredicto).length;
}

export function contagem(resposta) {
  const casos = resposta.casos ?? [];
  return {
    total: casos.length,
    passa: contar(casos, 'passa'),
    falha: contar(casos, 'falha'),
    bloqueado: contar(casos, 'bloqueado'),
    nao_aplicavel: contar(casos, 'nao_aplicavel'),
    achados: (resposta.achados ?? []).length,
    fora_de_nivel: (resposta.fora_de_nivel ?? []).length,
  };
}

// O documento de cenarios diz o esperado; o mapa diz o que a tela entrega. E do cruzamento dos
// dois que sai o ambito do teste.
export function atoEntrada({ mapa, casosDoDocumento }) {
  const porTipo = new Map();
  for (const accao of mapa.accoes) porTipo.set(accao.tipo, (porTipo.get(accao.tipo) ?? 0) + 1);
  const aproximadas = mapa.accoes.filter((accao) => accao.equivalente_aproximado === true);
  const repescados = mapa.repescagem?.alvos ?? [];

  return [
    `documento    ${mapa.documento} — ${casosDoDocumento} casos escritos (CT-nn)`,
    `tela         ${mapa.rota}`,
    `mapeado em   ${mapa.mapeado_em}, contra ${mapa.mapeado_contra?.ui ?? 'ui por declarar'}`,
    '',
    `A tela entrega ${mapa.accoes.length} accoes:`,
    ...[...porTipo.entries()].map(([tipo, n]) => `  ${String(n).padStart(2)} de ${tipo}`),
    '',
    `Casos que a tela NAO entrega: ${mapa.casos_sem_accao.join(', ') || 'nenhum'}`,
    '  -> saem como nao_aplicavel, nao como bloqueado. E divergencia documento x produto.',
    '',
    `Segunda passagem (repescagem): procurou ${repescados.length} alvos noutras telas da seccao`,
    ...repescados.slice(0, 4).map((alvo) => `  ${alvo.resultado.padEnd(22)} ${String(alvo.alvo).slice(0, 56)}`),
    ...(repescados.length > 4 ? [`  ... mais ${repescados.length - 4}`] : []),
    '',
    `Accoes marcadas equivalente_aproximado: ${aproximadas.length}`,
    ...aproximadas.map((accao) => `  ${accao.id} — ${accao.ressalva ?? 'trata o mesmo assunto por outro caminho'}`.slice(0, 100)),
    '',
    `Insumos que a corrida precisa: ${(mapa.insumos_necessarios ?? []).map((insumo) => insumo.obtivel).join(', ')}`,
    '  (tela = obtem-se pelo ecra, bd = por SQL, nao = ninguem consegue criar)',
  ];
}

// O agente nao recebe um script, recebe um enunciado com regras. Sao as regras que separam um
// veredicto de uma opiniao.
export function atoEnunciado({ enunciado }) {
  const linhas = enunciado.split('\n');
  const regras = linhas
    .map((linha) => linha.trim())
    .filter((linha) => /^\d\.\s|^##\s/.test(linha))
    .slice(0, 20)
    .map((linha) => `  ${linha.slice(0, 96)}`);

  return [
    `O enunciado tem ${linhas.length} linhas e ${enunciado.length} caracteres.`,
    'Entra por stdin no `claude -p`, com o mapa da tela e o documento de cenarios dentro.',
    '',
    'Os cabecalhos e as regras que leva:',
    ...regras,
  ];
}

// Nenhuma destas correccoes depende de o agente ter sido honesto: sao codigo, e correm sobre
// toda a resposta.
export function atoGuardas({ mapa }) {
  const { valido, erros } = validar(RESPOSTA_GRAVADA);
  const { resposta, avisos } = normalizar(RESPOSTA_GRAVADA, { nivel: 2, mapa });
  const naoExercidas = accoesNaoExercidas(mapa, resposta);
  const antes = contagem(RESPOSTA_GRAVADA);
  const depois = contagem(resposta);

  return [
    `Resposta valida contra o esquema: ${valido ? 'sim' : `nao — ${erros.join('; ')}`}`,
    '',
    `           ${'como o agente entregou'.padEnd(26)}depois das guardas`,
    `passa      ${String(antes.passa).padEnd(26)}${depois.passa}`,
    `falha      ${String(antes.falha).padEnd(26)}${depois.falha}`,
    `bloqueado  ${String(antes.bloqueado).padEnd(26)}${depois.bloqueado}`,
    `n/aplic.   ${String(antes.nao_aplicavel).padEnd(26)}${depois.nao_aplicavel}`,
    '',
    'O que a maquina corrigiu, e porque:',
    ...avisos.map((aviso) => `  . ${aviso}`),
    ...naoExercidas.map((id) => `  . ${id}: accao mapeada que nenhum caso exerceu (cobertura em falta)`),
  ];
}

// A mesma corrida, tres reguas. Passa, bloqueado e nao_aplicavel nunca sao filtrados: sao a
// contabilidade da cobertura, e tem de fechar igual nos tres.
export function atoNiveis({ mapa }) {
  const linhas = ['nivel  falha  achados  fora_de_nivel   passa  bloqueado  n/aplicavel'];
  for (const nivel of [1, 2, 3]) {
    const { resposta } = normalizar(RESPOSTA_GRAVADA, { nivel, mapa });
    const c = contagem(resposta);
    linhas.push(
      `  ${nivel}    ${String(c.falha).padStart(3)}    ${String(c.achados).padStart(4)}     `
      + `${String(c.fora_de_nivel).padStart(6)}       ${String(c.passa).padStart(3)}     `
      + `${String(c.bloqueado).padStart(4)}       ${String(c.nao_aplicavel).padStart(4)}`,
    );
  }
  return [
    ...linhas,
    '',
    'O que sai do relatorio nao desaparece: fica em fora_de_nivel[], com aviso.',
    'Da para reler uma corrida a regua diferente sem a pagar outra vez.',
  ];
}

// O que a suite ja encontrou a serio. Os numeros sao lidos dos ficheiros da corrida, nao
// escritos a mao: um relatorio que se digita e um relatorio que se pode enganar.
export function atoReal({ documentos }) {
  const soma = (campo) => documentos.reduce((total, doc) => total + doc[campo], 0);
  const linha = (nome, casos, passa, falha, bloqueado, achados, custo) =>
    `${nome.padEnd(34)}${String(casos).padStart(6)}${String(passa).padStart(7)}`
    + `${String(falha).padStart(7)}${String(bloqueado).padStart(7)}${String(achados).padStart(8)}`
    + `${custo.padStart(9)}`;

  const custo = soma('custo');
  return [
    linha('documento', 'casos', 'passa', 'falha', 'bloq.', 'achad.', 'custo'),
    ...documentos.map((doc) =>
      linha(doc.nome, doc.casos, doc.passa, doc.falha, doc.bloqueado, doc.achados, `$${doc.custo.toFixed(2)}`)),
    '',
    linha('TOTAL', soma('casos'), soma('passa'), soma('falha'), soma('bloqueado'), soma('achados'), `$${custo.toFixed(2)}`),
    '',
    `Media por documento: $${(custo / documentos.length).toFixed(2)}`,
    `Mais caro: $${Math.max(...documentos.map((d) => d.custo)).toFixed(2)}`
    + `  |  mais barato: $${Math.min(...documentos.map((d) => d.custo)).toFixed(2)}`,
  ];
}
