# Medição do T — medicamentos-prestacoes

Duas corridas do mesmo documento, 2026-08-16, contra o build da `origin/develop` (`30446d5`)
servido em `localhost:4174` com proxy para o core-api em `dev,oracle11` contra a ACCQUA.

A única diferença entre A e B é o `--image-responses` do Playwright MCP: em A o agente recebe
as capturas de ecrã, em B não.

## O que se mediu

| | A: imagens `allow` | B: imagens `omit` |
|---|---|---|
| Duração | 778 s ≈ 13 min | 772 s ≈ 13 min |
| Custo | **$10,71** | **$13,89** |
| Tokens de saída | 60 011 | 55 454 |
| Capturas anexadas aos veredictos | 6 | 2 |
| Modelo | `claude-sonnet-5` | `claude-sonnet-5` |
| `--bare` | não | não |

O `--bare` desligado nas duas corridas: a máquina onde correram não tem `ANTHROPIC_API_KEY`,
e sem chave o `--bare` falha a autenticação. Isso inflaciona ambas por igual — o agente herda
CLAUDE.md, hooks e plugins — pelo que a comparação A vs B continua válida, mas os valores
absolutos devem descer na VM.

### Omitir as imagens sai mais caro, não mais barato

Era a hipótese de partida que as capturas dominariam o consumo. **Está medida como falsa.**
Sem imagens, o agente gastou **30% mais** e demorou o mesmo: compensa a falta do ecrã com mais
navegação e mais despejos da árvore de acessibilidade, que também são tokens.

### E, pior, julga mal

Quatro dos doze veredictos mudaram, todos na direção de deixar passar defeitos reais:

| Caso | A (imagens) | B (sem imagens) |
|---|---|---|
| CT-03 | `falha` | `passa` |
| CT-04 | `falha` | `passa` |
| CT-08 | `falha` | `bloqueado` |
| CT-11 | `passa` | `bloqueado` |

O CT-03 e o CT-04 são defeitos confirmados (`Total SNS Apurado` vazio; embalagens da prescrição
sem grupo homogéneo) que a corrida sem imagens **não viu**.

**Conclusão: correr com `imagens: allow`.** É simultaneamente mais barato e mais correto, o que
é raro e dispensa discussão.

Nota sobre determinismo: estas duas corridas diferem numa opção de configuração, e não são uma
repetição da mesma corrida. **A repetibilidade do agente com a mesma configuração continua por
medir** — a PoC mediu-a nas ferramentas, não nesta suite.

O `--bare` desligado inflaciona o custo: o agente herda CLAUDE.md, hooks e plugins. Na VM,
com chave de API, deve ficar mais barato — quanto, não está medido.

## Extrapolação para a noite

73 documentos, lane mais longa com 8 documentos em série:

| | Valor |
|---|---|
| Caminho crítico (8 × T) | **~1 h 44 min** |
| Custo por noite (73 × custo) | **~$782** |
| Custo anual (250 noites úteis) | **~$195 000** |

O tempo **não é o problema**: 1h44 cabe folgadamente na janela noturna, e sobra margem para
as lanes que ainda não foram partidas. O problema é o custo.

Para comparar com a cotação de 2026-08-13, que o gestor já tem:

| Opção | Custo/ano |
|---|---|
| Playwright em CI | $871 |
| Momentic | $20 130 — **descartado por caro** |
| **Agentes Claude, 73 documentos por noite** | **~$195 000** |

O Momentic foi descartado por custar 23× o Playwright. Esta abordagem custa ~10× o Momentic
e ~220× o Playwright. A decisão de usar agentes foi tomada sem este número, porque ele não
existia.

## O que a corrida deu em qualidade

Não é só custo — o que se comprou por $10,71 é substancialmente melhor do que o que as
ferramentas da PoC deram:

- **Os 12 casos foram cobertos**, incluindo CT-04, CT-06, CT-07, CT-08 e CT-10, que ficaram
  por automatizar em Playwright e em Momentic.
- **O portão de calibração passou**: o CT-05 falhou, como tinha de falhar.
- **CT-03 falhou por uma razão melhor do que a da PoC.** A PoC dava-o como `passa` e listava
  o `Total SNS Apurado` vazio como achado separado (5.4); o agente ligou as duas coisas e
  reprovou o caso.
- Todas as falhas trazem captura de ecrã.
- **Cinco achados fora do guião**, um de confiança alta (linhas duplicadas na tabela de
  embalagens da Prestação).
- O agente marcou CT-06 como `bloqueado` por o documento não trazer o identificador
  necessário — que é exactamente o comportamento pedido pela regra 1 do enunciado. Não
  inventou massa.

## O que falta medir

Estes números vêm de **um** documento, o de calibração, que é dos mais densos do corpus (12
casos, com navegação ao detalhe e exportação). A média dos 73 pode ser mais baixa. Para fechar
a conta faltam três medições, e nenhuma delas foi feita:

1. **Mais documentos**, para ter uma média em vez de um ponto. Uns cinco, escolhidos entre um
   documento de consulta simples e um de armazém com escrita, chegam para saber a dispersão.
2. **`--bare` com chave de API**, que é o modo da VM. Deve descer o custo; quanto, não se sabe.
3. **Modelo mais leve nos documentos de leitura**, onde o veredicto é confronto de valores.

O travão das imagens está medido e **está fechado: não mexer**.

## Decisões que estes números pedem

1. **Levar o custo ao gestor antes de continuar.** ~$195k/ano é uma ordem de grandeza acima do
   Momentic, que foi descartado por caro. A decisão de usar agentes foi tomada sem este número.
2. **Considerar âmbito em vez de frequência.** 73 documentos todas as noites é a hipótese mais
   cara possível. As mesmas 73 uma vez por semana custam ~$40k/ano; 15 documentos por noite,
   escolhidos pelo que mudou, custam ~$40k/ano com resposta diária. É aqui que está a ordem de
   grandeza, não nas afinações técnicas.
3. **Não esperar que afinações resolvam isto.** O único travão medido saiu ao contrário. Os
   outros dois, mesmo no melhor cenário, não fazem $195k caber ao pé de $20k.
