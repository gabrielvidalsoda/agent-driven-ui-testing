import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validar } from './esquema.mjs';
import { normalizar } from './normalizar.mjs';
import { accoesNaoExercidas } from './mapa.mjs';

// `bare` faz o agente arrancar sem CLAUDE.md, hooks nem plugins — e o modo da VM, mais
// barato e reproduzivel. Mas exige ANTHROPIC_API_KEY: numa maquina autenticada por
// subscricao, --bare falha a autenticacao antes sequer de abrir o browser.
export function argumentosClaude({ caminhoMcp, modelo, bare = true }) {
  return [
    '-p',
    '--output-format', 'json',
    ...(bare ? ['--bare'] : []),
    '--mcp-config', caminhoMcp,
    '--strict-mcp-config',
    '--permission-mode', 'bypassPermissions',
    '--model', modelo,
  ];
}

// O enunciado entra por stdin. Passá-lo como argumento parte-se em Windows com shell: true,
// porque tem aspas, quebras de linha e o esquema JSON inteiro.
// Quantas vezes se tenta lancar o processo. Nao e o mesmo que repetir o documento: aqui o
// agente nem chegou a nascer, portanto nao gastou nada nem tocou na base.
const TENTATIVAS_SPAWN = 3;

function umaTentativa(argumentos, { pastaTrabalho, timeoutMs, enunciado, ambienteExtra, spawnar }) {
  return new Promise((resolve) => {
    // O ambiente extra leva as credenciais da base ao agente sem as pousar em disco nem as
    // meter no enunciado, que fica guardado nas evidencias da corrida.
    const processo = spawnar('claude', argumentos, {
      cwd: pastaTrabalho,
      shell: true,
      env: { ...process.env, ...ambienteExtra },
    });
    let stdout = '';
    let stderr = '';
    let terminado = false;
    const terminar = (r) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(relogio);
      resolve(r);
    };
    const relogio = setTimeout(() => {
      processo.kill();
      terminar({ codigo: -1, stdout, stderr: `${stderr}
timeout ao fim de ${timeoutMs}ms` });
    }, timeoutMs);
    processo.stdout.on('data', (d) => { stdout += d; });
    processo.stderr.on('data', (d) => { stderr += d; });
    processo.on('close', (codigo) => terminar({ codigo, stdout, stderr }));
    // Um spawn que falha emite 'error'. Sem este ouvinte o Node atira «Unhandled 'error'
    // event» e mata o processo da sessao inteira: as telas por correr perdem-se e as que ja
    // estavam lancadas ficam orfas, a gastar sem ninguem para recolher o resultado.
    // `naoNasceu` distingue-o de um agente que correu e saiu mal, que nao se repete.
    processo.on('error', (erro) => {
      terminar({ codigo: -1, stdout, stderr: `${stderr}
nao foi possivel lancar o agente: ${erro.message}`, naoNasceu: true });
    });
    // O stdin de um processo que nao chegou a nascer rebenta a escrita, e um EPIPE tardio
    // volta a atirar por cima do 'error' que ja tratamos.
    processo.stdin.on('error', () => {});
    try {
      processo.stdin.write(enunciado);
      processo.stdin.end();
    } catch {
      // o ouvinte de 'error' resolve a promessa
    }
  });
}

export async function lancarClaude(argumentos, {
  pastaTrabalho, timeoutMs, enunciado, ambienteExtra = {}, spawnar = spawn, esperaMs = 2000,
}) {
  let ultimo;
  for (let n = 1; n <= TENTATIVAS_SPAWN; n += 1) {
    ultimo = await umaTentativa(argumentos, { pastaTrabalho, timeoutMs, enunciado, ambienteExtra, spawnar });
    // So se repete o que nem chegou a nascer. Um agente que correu pode ja ter escrito na
    // base, e repeti-lo cobra outra vez o que ja se pagou.
    if (!ultimo.naoNasceu) return ultimo;
    if (n < TENTATIVAS_SPAWN) await new Promise((r) => setTimeout(r, esperaMs));
  }
  return ultimo;
}

// O agente antepoe prosa ao JSON com alguma frequencia («Now compiling the final report.»), e
// envolve-o em cercas de codigo. O JSON vem inteiro e valido; era o extrator que so aceitava
// cercas coladas ao inicio do texto. Medido a 2026-08-18: tres respostas boas deitadas fora,
// ~$27 pagos duas vezes.
function extrairJson(texto) {
  if (!texto) return null;
  for (const candidato of candidatosJson(texto)) {
    try {
      return JSON.parse(candidato);
    } catch {
      // proximo candidato
    }
  }
  return null;
}

function* candidatosJson(texto) {
  yield texto;
  // Um bloco em cercas, onde quer que esteja no texto.
  const emCercas = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (emCercas) yield emCercas[1];
  // Ultimo recurso: do primeiro { ao ultimo }. Serve quando nao houve cercas nenhumas.
  const abre = texto.indexOf('{');
  const fecha = texto.lastIndexOf('}');
  if (abre >= 0 && fecha > abre) yield texto.slice(abre, fecha + 1);
}

// Uma resposta que nao e JSON custa o mesmo que uma que e: o agente ja percorreu a tela toda.
// Guardar o texto cru e o que permite perceber se foi truncatura ou prosa a volta, e recuperar
// os veredictos a mao em vez de pagar a corrida outra vez.
function guardarRespostaCrua(pastaTrabalho, nome, texto) {
  if (!pastaTrabalho || !texto) return null;
  try {
    const caminho = join(pastaTrabalho, nome);
    writeFileSync(caminho, texto, 'utf8');
    return caminho;
  } catch {
    return null;
  }
}

export async function executarDocumento(opcoes, deps = {}) {
  const lancar = deps.lancar ?? lancarClaude;
  // Injetaveis porque o mesmo executor serve o testador e o mapeador, que devolvem contratos
  // diferentes: um resultado de teste e um mapa de tela.
  const validarResposta = deps.validar ?? validar;
  const normalizarResposta = deps.normalizar ?? normalizar;
  const argumentos = argumentosClaude(opcoes);
  const { codigo, stdout, stderr } = await lancar(argumentos, opcoes);

  if (codigo !== 0) {
    return {
      estado: 'erro',
      resposta: null,
      avisos: [`o agente terminou com codigo ${codigo}: ${stderr.trim()}`],
      metricas: null,
    };
  }

  const envelope = extrairJson(stdout);
  if (!envelope) {
    const guardado = guardarRespostaCrua(opcoes.pastaTrabalho, 'saida-crua.txt', stdout);
    const onde = guardado ? ` (texto cru em ${guardado})` : '';
    return { estado: 'erro', resposta: null, avisos: [`a saida do claude nao e JSON${onde}`], metricas: null };
  }

  const metricas = {
    duracaoMs: envelope.duration_api_ms ?? null,
    custoUsd: envelope.total_cost_usd ?? null,
    tokensEntrada: envelope.usage?.input_tokens ?? null,
    tokensSaida: envelope.usage?.output_tokens ?? null,
    modelo: Object.keys(envelope.modelUsage ?? {})[0] ?? null,
  };

  const resposta = extrairJson(envelope.result ?? '');
  if (!resposta) {
    const guardado = guardarRespostaCrua(opcoes.pastaTrabalho, 'resposta-crua.txt', envelope.result ?? '');
    const onde = guardado ? ` (texto cru em ${guardado})` : '';
    return { estado: 'erro', resposta: null, avisos: [`a resposta do agente nao e JSON${onde}`], metricas };
  }

  const { valido, erros } = validarResposta(resposta);
  if (!valido) {
    return { estado: 'erro', resposta, avisos: [`resposta fora do esquema: ${erros.join('; ')}`], metricas };
  }

  const normalizada = normalizarResposta(resposta, { nivel: opcoes.nivel, mapa: opcoes.mapa });
  const avisos = [...normalizada.avisos];
  // Uma accao mapeada que nenhum caso exerceu e cobertura em falta, nao defeito. Sem este
  // aviso, um documento que so exercesse metade do mapa passaria por completo.
  if (opcoes.mapa) {
    for (const id of accoesNaoExercidas(opcoes.mapa, normalizada.resposta)) {
      avisos.push(`${id}: accao do mapa que nao foi exercida por nenhum caso`);
    }
  }
  return { estado: 'concluido', resposta: normalizada.resposta, avisos, metricas };
}
