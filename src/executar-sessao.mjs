// Repete-se `erro`, nunca `falha` nem `bloqueado`: uma falha é resultado, e repeti-la esconde
// intermitências, que são o tipo de defeito que mais interessa apanhar.
const REPETIVEIS = new Set(['erro']);

// Quantos documentos correm ao mesmo tempo numa sessão paralela, quando o sessoes.yaml não
// diz outra coisa. Não é uma questão de máquina: os agentes partilham uma só base de dev, e
// acima disto ela devolve ORA-12516 sob carga — bloqueios que se leem de manhã como defeitos
// de produto e custam o mesmo que os bons.
export const CONCORRENCIA_OMISSAO = 4;

async function correrComRetry(documento, tentativas, correr) {
  let ultimo;
  for (let n = 1; n <= tentativas; n += 1) {
    ultimo = await correr(documento);
    if (!REPETIVEIS.has(ultimo.estado)) return { documento, ...ultimo, tentativas: n };
  }
  return { documento, ...ultimo, tentativas };
}

// Um documento que rebente não trava os seguintes: cada um é uma tarefa independente, e uma
// noite que pare no terceiro de nove não vale mais do que uma que não corra.
//
// O ambiente é a excepção. Se a aplicação deixou de responder, os documentos seguintes saem
// todos bloqueados por falta de dados, custam o mesmo que os bons, e de manhã leem-se como
// defeito de produto. Aí a sessão pára e diz `infra`, que é o estado que o desenho reserva
// para "a corrida nem chegou lá".
export async function executarSessao(
  { sessao, documentos, paralelo = false, tentativas = 2, concorrencia },
  { correr, verificar },
) {
  // A série é o mesmo pool com um trabalhador só: a sonda antes de cada documento e a paragem
  // em infra passam a valer nos dois modos, em vez de só naquele onde foram escritas.
  const trabalhadores = paralelo ? (concorrencia ?? CONCORRENCIA_OMISSAO) : 1;

  const resultados = new Map();
  const porIniciar = new Set(documentos);
  let proximo = 0;
  let razaoInfra = null;

  const trabalhador = async () => {
    for (;;) {
      if (razaoInfra) return;
      const i = proximo;
      if (i >= documentos.length) return;
      proximo += 1;
      const documento = documentos[i];
      const ambiente = verificar ? await verificar(documento) : { ok: true };
      if (!ambiente.ok) {
        razaoInfra = ambiente.razao;
        return;
      }
      porIniciar.delete(documento);
      resultados.set(documento, await correrComRetry(documento, tentativas, correr));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(trabalhadores, documentos.length) }, () => trabalhador()),
  );

  // Pela ordem dos documentos e não pela de chegada: um relatório que muda de ordem a cada
  // noite não se compara com o da anterior.
  const feitos = documentos.filter((d) => resultados.has(d)).map((d) => resultados.get(d));
  const totais = {
    custoUsd: somar(feitos, 'custoUsd'),
    duracaoMs: somar(feitos, 'duracaoMs'),
  };
  if (razaoInfra) {
    return {
      sessao,
      estado: 'infra',
      razao: razaoInfra,
      documentos: feitos,
      porCorrer: documentos.filter((d) => porIniciar.has(d)),
      ...totais,
    };
  }
  return { sessao, estado: 'concluida', documentos: feitos, ...totais };
}

function somar(resultados, campo) {
  return resultados.reduce((total, d) => total + (d.metricas?.[campo] ?? 0), 0);
}
