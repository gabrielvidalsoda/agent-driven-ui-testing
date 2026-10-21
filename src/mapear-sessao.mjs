import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// O que interessa de cada documento a quem lê o resumo a meio da noite: quanto custou, o que
// deu, e o que a tela não entrega.
function resumirDocumento(documento, resultado) {
  return {
    documento,
    estado: resultado.estado,
    caminho: resultado.caminho ?? null,
    accoes: resultado.resposta?.accoes?.length ?? 0,
    repescados: resultado.alvosRepescados ?? 0,
    encontrados_na_repescagem: (resultado.resposta?.repescagem?.alvos ?? [])
      .filter((a) => a.resultado === 'encontrado').map((a) => a.alvo),
    casos_sem_accao: resultado.resposta?.casos_sem_accao ?? [],
    custoUsd: resultado.metricas?.custoUsd ?? null,
    avisos: resultado.avisos ?? [],
  };
}

// Em série sempre: o mapeamento não escreve nada, mas partilha o mesmo alvo, e uma janela de
// browser por documento não encurta nada que valha a pena.
//
// `publicar` é chamado depois de CADA documento, não só no fim. Uma corrida de nove documentos
// anda duas horas; sem isto não há forma de saber quanto já se gastou enquanto ela corre — foi
// exactamente o que faltou responder a 2026-08-19.
export async function mapearSessao({ sessao, documentos }, { mapear, publicar }) {
  const resultados = [];
  for (const [i, documento] of documentos.entries()) {
    // Um documento que rebenta não trava os seguintes: cada um é uma tarefa independente, tal
    // como na corrida de testes.
    resultados.push(resumirDocumento(documento, await mapear(documento)));
    if (publicar) publicar(resumo({ sessao, resultados, porCorrer: documentos.slice(i + 1) }));
  }
  return resumo({ sessao, resultados, porCorrer: [] });
}

function resumo({ sessao, resultados, porCorrer }) {
  return {
    sessao,
    // O custo conta mesmo o do documento que rebentou: pagou-se à mesma.
    custoUsd: resultados.reduce((t, r) => t + (r.custoUsd ?? 0), 0),
    estado: porCorrer.length === 0 ? 'concluida' : 'a_correr',
    por_correr: porCorrer,
    documentos: resultados,
  };
}

export function escreverProgresso(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(conteudo, null, 2), 'utf8');
}
