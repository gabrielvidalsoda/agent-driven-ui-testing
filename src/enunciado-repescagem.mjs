import { ESQUEMA_REPESCAGEM } from './mapa.mjs';
import { seccaoAutenticacao } from './enunciado.mjs';

function listarAlvos(alvos) {
  return alvos
    .map(({ alvo, tipo, razao }) => {
      const porque = razao ? `\n    a primeira passagem disse: ${razao}` : '';
      return `- [${tipo}] ${alvo}${porque}`;
    })
    .join('\n');
}

function listarIrmas(irmas) {
  if (!irmas.length) return '   (não há outras telas nesta secção de menu)';
  return irmas.map(({ documento, url }) => `   - ${url}   (${documento})`).join('\n');
}

export function montarEnunciadoRepescagem({
  documento, texto, url, pastaEvidencias, alvos, irmas = [],
  produto = 'aplicação', autenticacao = null,
}) {
  return `És um analista a fazer a SEGUNDA PASSAGEM sobre uma tela do ${produto}. A primeira passagem
já levantou o que a tela entrega. Tu vens só atrás do que ela NÃO encontrou.
${seccaoAutenticacao(autenticacao)}
A tela principal está em ${url}.

=== O QUE FICOU POR ENCONTRAR ===

${listarAlvos(alvos)}

A primeira passagem concluiu que estas ações ou esta massa não existem. **Trata isso como uma
hipótese por confirmar, não como um facto.** O erro que vens corrigir é o de procurar uma coisa
pelo nome que o documento lhe dá e não a encontrar porque o produto lhe chama outra.

Para cada alvo, procura a MESMA COISA com OUTRA FORMA:

1. **Outro rótulo.** «Concluir» pode ser Terminar, Fechar, Finalizar, Encerrar, Submeter,
   Validar, Confirmar, Dar por findo, Arquivar. Pensa no verbo que o negócio usaria, não no que
   o documento escreveu.
2. **Sem texto.** Um ícone sem rótulo, um menu de três pontos numa linha da tabela, um menu de
   contexto, um atalho anunciado num tooltip.
3. **NOUTRA TELA DA MESMA SECÇÃO DE MENU.** É o caso mais provável e o que mais escapa: a ação
   existe, mas vive no ecrã do lado. Estas são as outras telas desta secção, e **deves
   visitá-las**:
${listarIrmas(irmas)}
4. **Como efeito de outra ação.** O estado pode não se atingir por um botão que lhe dê o nome,
   mas como consequência de outra coisa — encerrar uma caixa, expedir um lote, correr um
   fecho. Se for esse o caso, é essa a ação que registas.
5. **Por rota directa.** Uma tela existente sem botão que lá leve. Se suspeitares de uma,
   experimenta o URL.

REGRAS:

- **NÃO SUBMETES NADA.** Podes navegar, abrir modais e menus, expandir secções e ler o DOM. Não
  carregas em nada que altere estado, em nenhuma das telas que visitares. Não escreves na base.
- **DIZES O QUE PROCURASTE E ONDE**, em "procurei" e "onde", tenhas encontrado ou não. É isso
  que transforma um «não existe» numa conclusão que outra pessoa pode verificar, em vez de uma
  afirmação tua. Um alvo com "procurei" pobre não vale nada.
- **Não inventes uma ação para não vires de mãos vazias.** «Não existe» é a resposta certa na
  maior parte das vezes, e é uma resposta boa desde que venha com a prova da busca.
- **UM "encontrado" SEM CAPTURA NÃO CONTA.** Só marcas "encontrado" se viste o elemento
  renderizado no ecrã, e nesse caso gravas a captura que o mostra e pões o nome do ficheiro em
  "captura". Ler no código-fonte que o botão existe, deduzi-lo de uma rota, ou ver a chamada à
  API **não é ver**: é hipótese, e nessas marcas "nao_existe" e escreves em "nota" o que o
  código te fez suspeitar. Um "encontrado" que chegue sem "captura" é despromovido a afirmação
  por confirmar e não entra no mapa — perdes a descoberta e alguém tem de a repetir à mão.
- Quando encontrares, devolves a **ação completa** em "accao", no mesmo formato da primeira
  passagem, e — se ela viver noutra tela — pões a rota dessa tela no campo "rota" da ação.
- **SE NÃO FOR A MESMA COISA, DI-LO: "equivalente_aproximado": true.** Encontrar algo que trata
  o mesmo assunto por outro caminho, ou noutro momento do fluxo, é achado bom e queremos saber
  dele — mas não é o caso cumprido. Corrigir à mão o estado de uma caixa não é encerrá-la com a
  validação das faturas; corrigir uma fatura já arquivada não é registá-la na caixa. Marcas a
  bandeira, escreves em "nota" em que é que difere, e o caso continua por cobrir em vez de
  alguém lhe dar «passa» contra o substituto. **Na dúvida, marca.**
- Se o alvo for massa (um insumo) e afinal houver forma de a obter, marcas "encontrado" e dizes
  em "obtivel" se é pela tela ("tela") ou só por SQL ("bd").

Grava em ${pastaEvidencias} a captura de cada "encontrado" — uma por alvo, com o elemento
visível. É a mesma exigência que se faz a quem reporta uma falha.

A tua resposta final tem de ser EXCLUSIVAMENTE um objeto JSON válido, sem texto à volta e sem
cercas de código, respeitando este esquema:

${JSON.stringify(ESQUEMA_REPESCAGEM, null, 2)}

O campo "documento" tem de ser exatamente: ${documento}
Tem de haver uma entrada em "alvos" por cada alvo da lista acima, nenhuma a mais.

=== DOCUMENTO DE CENÁRIOS, para saberes o que cada caso pedia ===

${texto}
`;
}
