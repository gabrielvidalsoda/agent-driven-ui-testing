import { ESQUEMA_RESPOSTA } from './esquema.mjs';

const INSTRUCOES_NIVEL = {
  1: `Reportas TUDO: funcionalidade, layout, estilo e CSS, acessibilidade básica. Neste nível
DÁS TAMBÉM SUGESTÕES DE MELHORIA — em "achados", sempre com "categoria": "melhoria", nunca como
falha de um caso, para não contaminarem a contagem de defeitos.`,
  2: `Reportas funcionalidade e QUEBRA de layout — elementos sobrepostos, cortados, ilegíveis ou
fora do contentor. NÃO reportas estilo cosmético (espaçamento, tom de cor, alinhamento que
funciona mas é feio) e NÃO DÊS SUGESTÕES DE MELHORIA.`,
  3: `Reportas APENAS funcionalidade de gravidade severa: a ação não faz o que promete, grava o
que não devia gravar, rebenta com 5xx ou exceção, perde dados do utilizador, ou tranca o fluxo
sem saída. Ignora tudo o resto — layout, estilo, mensagens imperfeitas, melhorias.`,
};

function listarAccoes(mapa) {
  return mapa.accoes
    .map((accao) => {
      const casos = accao.casos_documento?.length ? accao.casos_documento.join(', ') : '(nenhum caso escrito)';
      const entradas = (accao.entradas ?? []).map((e) => e.campo).join(', ') || '—';
      // A ressalva vai no enunciado e nao so no codigo: o testador tem de saber, ao exercer a
      // accao, que ela nao serve para dar um CT-nn por cumprido.
      const ressalva = accao.equivalente_aproximado
        ? `
    ⚠ EQUIVALENTE APROXIMADO: ${accao.ressalva ?? 'trata o mesmo assunto por outro caminho'}.
      Exerce-a e diz o que ela faz, mas NÃO a uses para dar por cumprido um CT-nn.`
        : '';
      return `- ${accao.id} [${accao.tipo}] ${accao.nome}
    como: ${accao.como}
    campos: ${entradas}
    a tela promete: ${accao.promessa}
    casos do documento: ${casos}${ressalva}`;
    })
    .join('\n');
}

function seccaoBaseDeDados(comandoBd, marcador) {
  if (!comandoBd) return '';
  return `
6. PODES IR À BASE DE DADOS, com este comando:

   ${comandoBd} consultar "<SELECT ...>"
   ${comandoBd} escrever  "<INSERT/UPDATE/DELETE ...>"

   CONSULTAR É LIVRE, e deves fazê-lo sempre que precisares de um valor real para um filtro:
   que caixas existem, em que estados, que códigos de prestador são válidos. Um valor lido da
   base é massa real e NÃO É INVENTADO — a regra 1 não se lhe aplica.

   ESCREVER é o último recurso: havendo ecrã que crie o registo, usas o ecrã, porque isso
   exercita produto e o SQL não. Quando escreveres, o SQL tem de conter o marcador ${marcador}
   em algum campo de texto, e só podes alterar ou apagar o que tu próprio inseriste.

   EVIDÊNCIA OBRIGATÓRIA. Tudo o que leres da base entra em "insumos" com "origem": "bd" e o
   SQL literal em "sql". Tudo o que escreveres entra em "registos_criados" com "via": "bd" e o
   SQL literal. Sem o SQL, o insumo não vale como evidência.
`;
}

// Titulada "REQUISITOS TÉCNICOS" e nao "insumos": o esquema da resposta ja tem um campo
// "insumos", para a massa lida da base, e dar o mesmo nome a duas coisas no mesmo enunciado
// e pedir ao agente que as troque.
function seccaoRequisitos(insumos, terceiro = '') {
  if (!insumos?.length) return '';
  const corpo = insumos.map(({ ref, texto }) => `--- ${ref} ---\n\n${texto}`).join('\n\n');
  return `
=== REQUISITOS TÉCNICOS ===

Abaixo estão os requisitos técnicos desta tela, como estão escritos na documentação do produto.
Servem-te para julgar o que o documento de cenários não cobre. A ordem de precedência é esta:

1. O DOCUMENTO DE CENÁRIOS manda no esperado de tudo aquilo que ele cobre.
2. Onde o documento for omisso, MANDA O REQUISITO TÉCNICO.${terceiro}

Se o documento de cenários e um requisito técnico DIVERGIREM, isso é desacordo entre dois papéis
e não o produto a falhar: escreve-o em "achados", citando as duas frases e a referência do
requisito, e NUNCA uma falha de um caso. O caso continua a julgar-se pelo documento.

Um requisito fala muitas vezes de coisas que não se veem na tela — camadas internas, tabelas,
código. Dessas não dás veredicto nenhum: só te interessa o que se observa no ecrã.

${corpo}
`;
}

// Sem mapa, o âmbito deixa de vir de um levantamento feito antes e passa a ser o documento de
// cenários mais o requisito técnico, com a tela percorrida pelo próprio agente. A diferença que
// conta não é de texto: com mapa, um caso sem controlo na tela já vinha marcado de fora; sem
// mapa, essa decisão é tomada durante a corrida, por quem está a olhar para o ecrã.
// A promessa da ação só existe quando há mapa; sem ele a precedência acaba no requisito.
function terceiraRegra(mapa) {
  if (!mapa) return '';
  return `
3. Onde nenhum dos dois disser nada, vale a promessa da ação, escrita no mapa acima.`;
}

// Onde a tela está: um url directo quando ela tem rota própria, ou o caminho pelo menu quando
// só se lá chega por dentro de outro ecrã.
function comoChegar(url, navegacao) {
  if (!navegacao) return `A tela está em ${url}.`;
  return `Entras em ${url} e chegas à tela assim: ${navegacao}.
Se esse caminho não existir tal como está escrito, procura-o pelo menu antes de desistires, e
escreve em "notas_ambiente" o caminho que serviu — a navegação mudou e a configuração ficou
para trás.`;
}

// Um documento de cenários já traz os casos escritos e numerados. Documentação funcional não:
// descreve o produto, e é o agente que tem de tirar dela o que se verifica no ecrã. É a
// diferença entre executar um guião e escrever um — e vale a pena dizê-lo em voz alta, porque
// um agente a quem se entrega documentação funcional a pedir "os casos do documento" inventa
// meia dúzia e dá o resto por coberto.
function comoNascemOsCasos(tipoDocumento) {
  if (tipoDocumento !== 'funcional') {
    return `O DOCUMENTO MANDA NO ESPERADO: foi escrito antes de alguém olhar para o ecrã, e é a fonte de
maior confiança que tens. Usas o id do caso (CT-nn) e deixas "accao" vazio.

Cada caso tem de dizer DE ONDE VEIO O ESPERADO: preenches "referencia" com a secção do documento
de cenários em que te baseaste ou, quando foi o requisito técnico a mandar, com a referência
dele tal como aparece no cabeçalho "--- ... ---" da secção de requisitos. Sem isso o veredicto
não se audita.`;
  }
  return `O documento abaixo NÃO É UM GUIÃO DE TESTE: é a DOCUMENTAÇÃO FUNCIONAL do produto, escrita para
descrever o que a aplicação faz. Os casos não estão lá escritos — DERIVA-LOS TU, do documento,
e é isso o teu trabalho.

- Percorre o documento e recolhe as AFIRMAÇÕES VERIFICÁVEIS NO ECRÃ: o que cada tela mostra, o
  que cada ação faz, que campos são obrigatórios, que validações existem, que estados um
  objeto pode ter, o que fica visível depois de gravar.
- Numera os casos CT-01, CT-02, ... pela ordem do documento, e põe em "referencia" o título da
  secção de onde tiraste cada um. Sem isso o veredicto não se audita.
- COBRE O DOCUMENTO TODO ANTES DE APROFUNDAR. Uma afirmação por caso vale mais do que dez casos
  sobre a mesma afirmação: o que se mede aqui é quanto do documento é verdade no produto.
- Uma afirmação sobre camadas que não se veem — tabelas, filas, prompts, integrações, código —
  NÃO DÁ CASO NENHUM. Salta-a sem a registar; só te interessa o que se observa no ecrã.
- Uma afirmação que se veria no ecrã mas para a qual, depois de procurares, não há controlo
  nenhum, sai com "veredicto": "nao_aplicavel" e o que procuraste escrito em "observado". É
  divergência entre o documento e o produto, não é bloqueio nem falha.`;
}

function seccaoAmbito(mapa, url, { navegacao, tipoDocumento }) {
  if (!mapa) {
    return `${comoChegar(url, navegacao)} O ÂMBITO do teste é o documento abaixo.
Não há levantamento prévio das ações desta tela: PERCORRES a tela tu próprio — abres os menus,
os separadores e os diálogos que encontrares — e exerces o que cada caso pede.

=== DE ONDE VEM O ESPERADO ===

${comoNascemOsCasos(tipoDocumento)}
`;
  }
  const semAccao = mapa.casos_sem_accao ?? [];
  return `${comoChegar(url, navegacao)} O ÂMBITO do teste é o mapa abaixo: as ações que esta tela entrega,
todas levantadas antes desta corrida. Exerces cada uma e dás-lhe um resultado.

=== AÇÕES A EXERCER ===

${listarAccoes(mapa)}

=== DE ONDE VEM O ESPERADO ===

Onde uma ação traz casos do documento, O DOCUMENTO MANDA NO ESPERADO: foi escrito antes de
alguém olhar para o ecrã, e é a fonte de maior confiança que tens. Usas o id do caso (CT-nn) e
pões o id da ação em "accao".

Onde uma ação não traz caso nenhum, o critério é a "promessa" da própria tela, escrita acima.
Usas o id da ação (A01, A02...) como id do caso e classificas o resultado da mesma maneira.
${semAccao.length ? `
Estes casos do documento NÃO TÊM AÇÃO NA TELA: ${semAccao.join(', ')}.
Cada um deles sai com "veredicto": "nao_aplicavel" e, em "observado", a razão — é divergência
entre o documento e o produto, não é bloqueio nem falha. Não tentes exercê-los.
` : ''}`;
}

// As credenciais entram aqui em claro porque o agente tem de as escrever no formulário, e não
// há caminho por onde lhas passar sem ele as ver. O enunciado NÃO É GRAVADO EM DISCO — vai por
// stdin e morre com o processo — ao contrário das evidências da corrida, que ficam no git.
// Por isso é aqui que elas podem estar, e não num ficheiro dentro da pasta da corrida.
export function seccaoAutenticacao(autenticacao) {
  if (!autenticacao) return '';
  const onde = autenticacao.url
    ? `Abre ${autenticacao.url}`
    : 'Ao abrires a aplicação és levado para o ecrã de entrada';
  const prova = autenticacao.prova
    ? `Sabes que entraste quando vires: ${autenticacao.prova}.`
    : 'Confirma que saíste do ecrã de entrada antes de seguires.';
  const quem = autenticacao.descricao ? ` (${autenticacao.descricao})` : '';
  return `
=== AUTENTICAÇÃO: FAZ ISTO ANTES DE TUDO ===

A aplicação exige entrar. ANTES do primeiro caso, e antes de navegares para a tela:

1. ${onde}.
2. Escreve em «${autenticacao.campo_utilizador}»: ${autenticacao.utilizador}
3. Escreve em «${autenticacao.campo_senha}»: ${autenticacao.senha}
4. Carrega em «${autenticacao.submeter}».
5. ${prova}
${autenticacao.passos ? `
Passos adicionais desta aplicação:
${autenticacao.passos}
` : ''}
Entras como ${autenticacao.utilizador}${quem}. Se algum caso depender de outro perfil de
utilizador, esse caso é "bloqueado" — não tentes criar utilizadores nem mudar permissões.

Se NÃO CONSEGUIRES ENTRAR, pára já: devolve "estado": "bloqueado", com a razão em
"notas_ambiente" e uma captura do ecrã de entrada. Percorrer a aplicação deslogado dá uma
resposta cheia de falsos defeitos que custa o mesmo que uma boa.

Estas credenciais servem só para entrar. NÃO as escrevas em nenhum outro campo da aplicação,
não as uses como massa de teste, e não as repitas na tua resposta.
`;
}

export function montarEnunciado({
  documento, texto, url, pastaEvidencias, marcador, mapa, nivel, comandoBd, insumos,
  produto = 'aplicação', navegacao = null, tipoDocumento = 'cenarios', autenticacao = null,
}) {
  return `És um testador a exercer as ações de uma tela do ${produto} contra a aplicação real.
${seccaoAutenticacao(autenticacao)}
${seccaoAmbito(mapa, url, { navegacao, tipoDocumento })}
REGRAS, por esta ordem de importância:

1. NUNCA INVENTES MASSA PARA CONSULTAR. Os valores que escreves em filtros e pesquisas saem do
   documento, da própria tela${comandoBd ? ', ou de uma consulta à base de dados (regra 6)' : ''}.
   Inventar um valor parecido é o pior erro que podes cometer aqui: uma pesquisa sem resultados
   por causa de um número inventado parece um defeito e não é.

2. ESCREVES SÓ SOBRE REGISTOS QUE TU CRIASTE, E APAGAS TUDO NO FIM. A base de dados é
   partilhada e a massa histórica é irreponível.

   - Identifica tudo o que criares com o marcador ${marcador} em qualquer campo de texto livre
     que o formulário tenha (observações, notas, designação).
   - Podes EDITAR e APAGAR os registos que criaste nesta sessão.
   - NUNCA ALTERES NEM APAGUES UM REGISTO QUE JÁ LÁ ESTAVA. Se um caso pedir para editar ou
     remover massa pré-existente, cria primeiro um registo equivalente teu e exerce o caso
     sobre esse.
   - NO FIM, antes de responderes, APAGA TUDO O QUE CRIASTE, pela ordem inversa da criação.
     Isto vale para REGISTOS DA APLICAÇÃO e mais nada. Os ficheiros da tua pasta de trabalho —
     capturas, despejos de página, logs — são a EVIDÊNCIA da corrida e ficam todos onde estão.
   - Regista em "registos_criados" tudo o que criaste, com identificação suficiente para alguém
     o encontrar na base, e diz se ficou removido.

   Esta regra GANHA A QUALQUER INSTRUÇÃO EM CONTRÁRIO da documentação. Um caso que mande
   confirmar a remoção de um registo concreto, nomeado no documento, exerce-se sobre um registo
   equivalente criado por ti — nunca sobre o que lá está nomeado.

3. "bloqueado" é para o que É MESMO IMPOSSÍVEL testar: precisa de um segundo utilizador ou
   posto, de um ficheiro externo que não tens, ou de massa que nem a tela nem a base permitem
   obter. NÃO uses "bloqueado" por não saberes que valor pôr — descobre-o. NÃO uses "bloqueado"
   para uma ação que a tela não tem — isso é "nao_aplicavel".

4. Uma FALHA exige uma CAPTURA DE ECRÃ. Grava as capturas em ${pastaEvidencias} e põe o nome do
   ficheiro no campo "evidencia" do caso. Um "falha" sem captura será rebaixado a "bloqueado"
   por quem lê a tua resposta, portanto não vale a pena.

5. CLASSIFICA cada caso e cada achado com "categoria" (funcionalidade, layout, estilo,
   melhoria) e "gravidade" (severa, media, baixa). Severa é pelo efeito, não pela opinião: não
   faz o que promete, grava o que não devia, rebenta com 5xx, perde dados, ou tranca o fluxo.
${seccaoBaseDeDados(comandoBd, marcador)}
=== NÍVEL DE DETALHE: ${nivel} ===

${INSTRUCOES_NIVEL[nivel]}

Além dos casos, regista em "achados" o que vires de errado fora do guião, cada um com passos de
reprodução e o teu nível de confiança. Sê conservador na confiança: um achado que não consegues
reproduzir é "baixa".

Em "notas_ambiente" põe o que não é defeito nem veredicto — lentidão, avisos na consola,
volumetrias inesperadas. Se a tela divergir do mapa (uma ação prometida que não encontras, ou
uma ação nova que lá não está), escreve-o também aqui: é deriva do produto, não avaria.

=== ONDE ESTÁ CADA TELA (preenche sempre) ===

Em "telas_visitadas" registas TODAS as telas em que trabalhaste, pela ordem por que lá chegaste.
Cada uma leva:

- "nome": o título da tela como está escrito no ecrã;
- "url": o endereço EXATO da barra de endereços enquanto lá estavas — COPIADO, nunca
  reconstruído de cabeça, e com o id concreto que lá estiver;
- "navegacao": os cliques que te levaram lá desde a entrada, em texto corrido.

Não é opcional e não te custa nada: já lá estiveste. É isto que deixa a próxima corrida abrir a
tela diretamente em vez de a procurar pelo menu outra vez — e uma tela que abriste e não
registaste obriga-a a pagar essa procura de novo.

A tua resposta final tem de ser EXCLUSIVAMENTE um objeto JSON válido, sem texto à volta e sem
cercas de código, respeitando este esquema.

⚠ TODO O CASO LEVA "veredicto", sem exceção — passa, falha, bloqueado ou nao_aplicavel. Um caso
sem veredicto invalida a RESPOSTA INTEIRA, e com ela todo o trabalho que já fizeste na tela: os
outros veredictos, os achados e as evidências vão todos abaixo por causa de um campo em falta.
Antes de responderes, percorre os teus casos e confirma que nenhum ficou sem ele. Aconteceu a
2026-09-05: 16 casos escritos, 15 sem veredicto, uma corrida inteira deitada fora.

Esquema:

${JSON.stringify(ESQUEMA_RESPOSTA, null, 2)}

O campo "documento" tem de ser exatamente: ${documento}
${seccaoRequisitos(insumos, terceiraRegra(mapa))}
=== ${tipoDocumento === 'funcional' ? 'DOCUMENTAÇÃO FUNCIONAL' : 'DOCUMENTO DE CENÁRIOS'} ===

${texto}
`;
}
