import { describe, it, expect } from 'vitest';
import { verificarAmbiente } from '../src/ambiente.mjs';

describe('verificarAmbiente', () => {
  it('dá por bom quando a sonda responde', async () => {
    const buscar = async () => ({ ok: true, status: 200 });
    expect(await verificarAmbiente({ url: 'http://x/api' }, { buscar })).toEqual({ ok: true, razao: null });
  });

  it('reprova um código de erro e diz qual', async () => {
    const buscar = async () => ({ ok: false, status: 503 });
    const r = await verificarAmbiente({ url: 'http://x/api' }, { buscar });
    expect(r.ok).toBe(false);
    expect(r.razao).toContain('503');
  });

  it('reprova quando não responde a tempo', async () => {
    const buscar = async () => {
      const erro = new Error('tempo esgotado');
      erro.name = 'TimeoutError';
      throw erro;
    };
    const r = await verificarAmbiente({ url: 'http://x/api', timeoutMs: 5000 }, { buscar });
    expect(r.ok).toBe(false);
    expect(r.razao).toContain('5000ms');
  });

  it('reprova quando a ligação nem se estabelece', async () => {
    const buscar = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect((await verificarAmbiente({ url: 'http://x/api' }, { buscar })).razao).toContain('ECONNREFUSED');
  });
});

describe('o que conta como vivo', () => {
  it('um 4xx conta como vivo: houve resposta do outro lado', async () => {
    const buscar = async () => ({ ok: false, status: 400 });
    expect((await verificarAmbiente({ url: 'http://x/api' }, { buscar })).ok).toBe(true);
  });

  it('um 500 conta como em baixo', async () => {
    const buscar = async () => ({ ok: false, status: 500 });
    expect((await verificarAmbiente({ url: 'http://x/api' }, { buscar })).ok).toBe(false);
  });
});
