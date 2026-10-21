import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { argumentosClaude, executarDocumento, lancarClaude } from '../src/executar-documento.mjs';

const RESPOSTA_AGENTE = {
  documento: 'a/b.md', estado: 'concluido',
  casos: [{ id: 'CT-01', veredicto: 'passa', esperado: '14', observado: '14', evidencia: ['ct01.png'] }],
  achados: [], notas_ambiente: [],
};

function agenteFalso(saidaClaude) {
  return async () => ({ codigo: 0, stdout: JSON.stringify(saidaClaude), stderr: '' });
}

const SAIDA_BOA = {
  is_error: false,
  result: JSON.stringify(RESPOSTA_AGENTE),
  duration_api_ms: 1234,
  total_cost_usd: 0.42,
  usage: { input_tokens: 100, output_tokens: 20 },
  modelUsage: { 'claude-sonnet-5': {} },
};

const BASE = {
  documento: 'a/b.md', enunciado: 'faz lá', caminhoMcp: '/tmp/mcp.json',
  modelo: 'sonnet', pastaTrabalho: '/tmp/t', timeoutMs: 1000,
};

describe('argumentosClaude', () => {
  it('corre em modo nao-interativo com saida JSON', () => {
    const a = argumentosClaude(BASE);
    expect(a).toContain('-p');
    expect(a.join(' ')).toContain('--output-format json');
  });

  it('nao mete o enunciado na linha de comandos (vai por stdin)', () => {
    expect(argumentosClaude(BASE).join(' ')).not.toContain('faz lá');
  });

  it('usa --bare e --strict-mcp-config para o agente nao herdar contexto local', () => {
    const a = argumentosClaude({ ...BASE, bare: true }).join(' ');
    expect(a).toContain('--bare');
    expect(a).toContain('--strict-mcp-config');
  });

  // --bare exige ANTHROPIC_API_KEY: e o modo da VM. Numa maquina com subscricao, pedir --bare
  // faz o agente falhar na autenticacao antes de abrir o browser.
  it('omite --bare quando pedido, mantendo o isolamento do MCP', () => {
    const a = argumentosClaude({ ...BASE, bare: false }).join(' ');
    expect(a).not.toContain('--bare');
    expect(a).toContain('--strict-mcp-config');
  });

  it('nao pede permissoes', () => {
    expect(argumentosClaude(BASE).join(' ')).toContain('--permission-mode bypassPermissions');
  });
});

describe('executarDocumento', () => {
  it('devolve a resposta validada e as metricas', async () => {
    const r = await executarDocumento(BASE, { lancar: agenteFalso(SAIDA_BOA) });
    expect(r.estado).toBe('concluido');
    expect(r.resposta.casos[0].id).toBe('CT-01');
    expect(r.metricas).toEqual({
      duracaoMs: 1234, custoUsd: 0.42, tokensEntrada: 100, tokensSaida: 20, modelo: 'claude-sonnet-5',
    });
  });

  it('aceita JSON dentro de cercas de codigo', async () => {
    const comCercas = { ...SAIDA_BOA, result: '```json\n' + JSON.stringify(RESPOSTA_AGENTE) + '\n```' };
    const r = await executarDocumento(BASE, { lancar: agenteFalso(comCercas) });
    expect(r.estado).toBe('concluido');
  });

  it('devolve erro quando o agente responde texto que nao e JSON', async () => {
    const lixo = { ...SAIDA_BOA, result: 'Correu tudo bem!' };
    const r = await executarDocumento(BASE, { lancar: agenteFalso(lixo) });
    expect(r.estado).toBe('erro');
    expect(r.avisos.join(' ')).toMatch(/JSON/i);
  });

  it('devolve erro quando o JSON nao respeita o esquema', async () => {
    const mau = { ...SAIDA_BOA, result: JSON.stringify({ documento: 'a/b.md' }) };
    const r = await executarDocumento(BASE, { lancar: agenteFalso(mau) });
    expect(r.estado).toBe('erro');
  });

  it('degrada falha sem evidencia e regista o aviso', async () => {
    const semProva = {
      ...RESPOSTA_AGENTE,
      casos: [{ id: 'CT-05', veredicto: 'falha', esperado: 'a', observado: 'b', evidencia: [] }],
    };
    const r = await executarDocumento(BASE, { lancar: agenteFalso({ ...SAIDA_BOA, result: JSON.stringify(semProva) }) });
    expect(r.resposta.casos[0].veredicto).toBe('bloqueado');
    expect(r.avisos.join(' ')).toMatch(/degradada/);
  });

  it('devolve erro quando o processo rebenta', async () => {
    const rebenta = async () => ({ codigo: 1, stdout: '', stderr: 'boom' });
    const r = await executarDocumento(BASE, { lancar: rebenta });
    expect(r.estado).toBe('erro');
    expect(r.avisos.join(' ')).toMatch(/boom/);
  });
});

describe('resposta que não é JSON', () => {
  function pastaTemporaria() {
    return mkdtempSync(join(tmpdir(), 'crua-'));
  }

  it('guarda a resposta crua para poder ser recuperada à mão', async () => {
    const pastaTrabalho = pastaTemporaria();
    const lancar = async () => ({
      codigo: 0,
      stdout: JSON.stringify({ result: 'Percorri a tela e os veredictos são: CT-01 passa...' }),
      stderr: '',
    });
    const r = await executarDocumento({ pastaTrabalho }, { lancar });
    expect(r.estado).toBe('erro');
    expect(readFileSync(join(pastaTrabalho, 'resposta-crua.txt'), 'utf8')).toContain('CT-01 passa');
    expect(r.avisos[0]).toContain('resposta-crua.txt');
  });

  it('guarda a saída crua quando nem o envelope é JSON', async () => {
    const pastaTrabalho = pastaTemporaria();
    const lancar = async () => ({ codigo: 0, stdout: 'erro de autenticação', stderr: '' });
    const r = await executarDocumento({ pastaTrabalho }, { lancar });
    expect(readFileSync(join(pastaTrabalho, 'saida-crua.txt'), 'utf8')).toContain('autenticação');
  });

  it('não rebenta quando não há pasta de trabalho', async () => {
    const lancar = async () => ({ codigo: 0, stdout: 'nao e json', stderr: '' });
    expect((await executarDocumento({}, { lancar })).estado).toBe('erro');
  });
});

describe('extração do JSON da resposta', () => {
  const RESPOSTA = {
    documento: 'a/b.md',
    estado: 'concluido',
    casos: [{ id: 'CT-01', veredicto: 'passa', esperado: '1', observado: '1', evidencia: [] }],
    achados: [],
  };
  const envelope = (result) => ({ codigo: 0, stdout: JSON.stringify({ result }), stderr: '' });

  it('aceita JSON puro', async () => {
    const lancar = async () => envelope(JSON.stringify(RESPOSTA));
    expect((await executarDocumento({}, { lancar })).estado).toBe('concluido');
  });

  it('aceita JSON em cercas de código', async () => {
    const lancar = async () => envelope('```json\n' + JSON.stringify(RESPOSTA) + '\n```');
    expect((await executarDocumento({}, { lancar })).estado).toBe('concluido');
  });

  it('aceita prosa antes das cercas, que é o que o agente faz na prática', async () => {
    const lancar = async () =>
      envelope('Now compiling the final report.\n\n```json\n' + JSON.stringify(RESPOSTA) + '\n```');
    expect((await executarDocumento({}, { lancar })).estado).toBe('concluido');
  });

  it('aceita prosa antes de JSON sem cercas nenhumas', async () => {
    const lancar = async () => envelope('Aqui vai o relatório:\n' + JSON.stringify(RESPOSTA));
    expect((await executarDocumento({}, { lancar })).estado).toBe('concluido');
  });

  it('continua a recusar texto que não tem JSON nenhum', async () => {
    const lancar = async () => envelope('não consegui completar a tarefa');
    expect((await executarDocumento({}, { lancar })).estado).toBe('erro');
  });
});

describe('cobertura do mapa e nivel', () => {
  const agenteQueDevolve = (resposta) => async () => ({
    codigo: 0,
    stdout: JSON.stringify({ result: JSON.stringify(resposta) }),
    stderr: '',
  });

  it('avisa das accoes do mapa que nenhum caso exerceu', async () => {
    const mapa = {
      documento: 'a/b.md', rota: 'a/b', mapeado_em: '2026-08-19',
      accoes: [
        { id: 'A01', tipo: 'consulta', nome: 'n', como: 'c', promessa: 'p' },
        { id: 'A02', tipo: 'criacao', nome: 'n', como: 'c', promessa: 'p' },
      ],
    };
    const resposta = {
      documento: 'a/b.md', estado: 'concluido', achados: [],
      casos: [{ id: 'CT-01', accao: 'A01', veredicto: 'passa', esperado: 'x', observado: 'x', evidencia: [] }],
    };
    const r = await executarDocumento({ documento: 'a/b.md', mapa, nivel: 2 },
      { lancar: agenteQueDevolve(resposta) });
    expect(r.avisos.join(' ')).toMatch(/A02.*nao foi exercida/i);
    expect(r.avisos.join(' ')).not.toMatch(/A01/);
  });

  it('propaga o nivel para o normalizar', async () => {
    const resposta = {
      documento: 'a/b.md', estado: 'concluido', achados: [],
      casos: [{ id: 'CT-01', veredicto: 'falha', esperado: 'x', observado: 'y',
                evidencia: ['a.png'], categoria: 'estilo', gravidade: 'baixa' }],
    };
    const r = await executarDocumento({ documento: 'a/b.md', nivel: 3 },
      { lancar: agenteQueDevolve(resposta) });
    expect(r.resposta.casos).toHaveLength(0);
    expect(r.resposta.fora_de_nivel).toHaveLength(1);
  });
});

// Um spawn que falha emite 'error' no processo filho. Sem ouvinte, o Node atira
// «Unhandled 'error' event» e mata o processo inteiro -- levando a sessao toda com ele e
// deixando os agentes ja lancados orfaos, a gastar sem ninguem para recolher o resultado.
// Aconteceu a 2026-09-03 com 8 agentes em simultaneo: `spawn cmd.exe ENOENT` matou 25 telas.
describe('lancarClaude quando o spawn falha', () => {
  const filhoQueFalha = (mensagem) => () => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.stdin = Object.assign(new EventEmitter(), { write() {}, end() {} });
    p.kill = () => {};
    setImmediate(() => p.emit('error', new Error(mensagem)));
    return p;
  };

  it('resolve em vez de atirar, para a sessao nao morrer', async () => {
    const r = await lancarClaude([], {
      pastaTrabalho: '/tmp/t', timeoutMs: 1000, enunciado: 'x',
      spawnar: filhoQueFalha('spawn cmd.exe ENOENT'),
    });
    expect(r.codigo).toBe(-1);
    expect(r.stderr).toContain('ENOENT');
  });

  it('o documento sai em erro, que e o estado que a suite repete', async () => {
    const r = await executarDocumento({
      ...BASE,
      lancar: () => Promise.resolve({ codigo: -1, stdout: '', stderr: 'spawn cmd.exe ENOENT' }),
    });
    expect(r.estado).toBe('erro');
  });
});

// O ENOENT do cmd.exe e transitorio: aparece sob carga e passa a seguir. Repetir o spawn ali
// mesmo custa milissegundos e salva a tela; deixar a tentativa do documento tratar disso gasta
// as duas e perde-a. Medido a 2026-09-03: 3 telas perdidas assim, todas a custo zero.
describe('lancarClaude repete um spawn transitorio', () => {
  const filho = (aoLancar) => {
    const p = new EventEmitter();
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.stdin = Object.assign(new EventEmitter(), { write() {}, end() {} });
    p.kill = () => {};
    setImmediate(aoLancar(p));
    return p;
  };

  it('a segunda tentativa vale, e o documento nem sabe que falhou', async () => {
    let n = 0;
    const spawnar = () => {
      n += 1;
      return n === 1
        ? filho((p) => () => p.emit('error', new Error('spawn cmd.exe ENOENT')))
        : filho((p) => () => { p.stdout.emit('data', 'ok'); p.emit('close', 0); });
    };
    const r = await lancarClaude([], {
      pastaTrabalho: '/tmp/t', timeoutMs: 5000, enunciado: 'x', spawnar, esperaMs: 1,
    });
    expect(r.codigo).toBe(0);
    expect(r.stdout).toBe('ok');
    expect(n).toBe(2);
  });

  it('desiste ao fim das tentativas e devolve a ultima razao', async () => {
    let n = 0;
    const spawnar = () => {
      n += 1;
      return filho((p) => () => p.emit('error', new Error('spawn cmd.exe ENOENT')));
    };
    const r = await lancarClaude([], {
      pastaTrabalho: '/tmp/t', timeoutMs: 5000, enunciado: 'x', spawnar, esperaMs: 1,
    });
    expect(r.codigo).toBe(-1);
    expect(r.stderr).toContain('ENOENT');
    expect(n).toBe(3);
  });

  // Um agente que nasceu e correu mal nao se repete aqui: pode ja ter escrito na base, e
  // repeti-lo cobra outra vez o que ja se pagou.
  it('nao repete um agente que chegou a correr e saiu com erro', async () => {
    let n = 0;
    const spawnar = () => {
      n += 1;
      return filho((p) => () => { p.stderr.emit('data', 'rebentou'); p.emit('close', 1); });
    };
    const r = await lancarClaude([], {
      pastaTrabalho: '/tmp/t', timeoutMs: 5000, enunciado: 'x', spawnar, esperaMs: 1,
    });
    expect(r.codigo).toBe(1);
    expect(n).toBe(1);
  });
});
