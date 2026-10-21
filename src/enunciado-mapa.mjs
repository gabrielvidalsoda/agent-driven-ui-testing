import { ESQUEMA_MAPA } from './mapa.mjs';
import { seccaoAutenticacao } from './enunciado.mjs';

export function montarEnunciadoMapa({
  documento, texto, url, pastaEvidencias, versoes = {},
  produto = 'aplicação', navegacao = null, autenticacao = null,
}) {
  return `És um analista a levantar o inventário do que uma tela do ${produto} entrega. NÃO és um
testador: nesta passagem não julgas nada, só descreves.
${seccaoAutenticacao(autenticacao)}
${navegacao
  ? `Entras em ${url} e chegas à tela assim: ${navegacao}.`
  : `A tela está em ${url}.`} Abre-a com o browser e percorre-a inteira.

REGRAS:

1. NÃO SUBMETES NADA. Podes abrir modais, expandir secções, focar campos, abrir combobox para
   ver que valores oferecem, e navegar entre separadores. NÃO carregas em Guardar, Criar,
   Remover, Confirmar, Expedir nem em nenhum botão que altere estado. Também não escreves na
   base de dados. Se um botão for irreversível e não souberes o que faz, descreves o que o
   rótulo promete e segues.

2. DESCREVES O QUE A TELA TEM, não o que devia ter. Cada ação que a tela oferece vira uma
   entrada em "accoes": consulta, filtro, criacao, edicao, remocao, navegacao ou exportacao.
   Consultas e filtros contam como ações de pleno direito — são metade do que uma tela faz.

3. "promessa" é O QUE A TELA PROMETE, lido do rótulo do botão, do cabeçalho da grelha, do texto
   de ajuda ou da coluna que aparece. NÃO é o que o documento de cenários espera. Serve de
   critério para testar as ações que nenhum caso escrito cobre.

4. CRUZAS COM O DOCUMENTO. Para cada ação, "casos_documento" leva os CT-nn do documento abaixo
   que a exercem. No fim, "casos_sem_accao" leva os CT-nn que ficaram sem ação nenhuma na tela —
   é a lista mais importante que produzes, porque é onde o desenho e o produto divergem.

5. LISTAS OS INSUMOS. Em "insumos_necessarios" pões a massa de que um testador precisaria para
   exercer estas ações — «caixa em estado Aguardando preparação», «guia ANF por receber» — e
   classificas cada uma em "obtivel": "tela" se há ecrã que a crie, "bd" se só por SQL,
   "nao" se depende de coisa que não existe no ambiente (segundo operador, crachá físico,
   ficheiro externo). Não inventes valores concretos: aqui descreve-se o tipo de massa.

Grava capturas de ecrã em ${pastaEvidencias} se te ajudarem a descrever; não são obrigatórias.

A tua resposta final tem de ser EXCLUSIVAMENTE um objeto JSON válido, sem texto à volta e sem
cercas de código, respeitando este esquema:

${JSON.stringify(ESQUEMA_MAPA, null, 2)}

O campo "documento" tem de ser exatamente: ${documento}
O campo "mapeado_contra" tem de ser exatamente: ${JSON.stringify(versoes)}

=== DOCUMENTO DE CENÁRIOS, para o cruzamento ===

${texto}
`;
}
