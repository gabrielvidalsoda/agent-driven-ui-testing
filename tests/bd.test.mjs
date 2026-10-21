import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

// A guarda dispara antes de o script tocar no docker, portanto estes testes correm sem base
// de dados nenhuma. O caso feliz nao se testa aqui: exigiria a VPN e a ACCQUA de pe.
function bd(...args) {
  return spawnSync('bash', ['scripts/bd.sh', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CCMSNS_BD_LIGACAO: 'utilizador/senha@//host:1521/ACCQUA',
      CCMSNS_BD_MARCADOR: 'AGENTE-20260819-teste',
    },
  });
}

describe('uso', () => {
  it('sem argumentos, explica-se e sai com 2', () => {
    const r = bd();
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/consultar|escrever/);
  });

  it('com um modo desconhecido, sai com 2', () => {
    expect(bd('apagar-tudo', 'SELECT 1 FROM dual').status).toBe(2);
  });

  it('sem ligacao no ambiente, sai com 3 e nao tenta nada', () => {
    const r = spawnSync('bash', ['scripts/bd.sh', 'consultar', 'SELECT 1 FROM dual'], {
      encoding: 'utf8',
      env: { ...process.env, CCMSNS_BD_LIGACAO: '' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/CCMSNS_BD_LIGACAO/);
  });
});

describe('consultar', () => {
  it('recusa DML', () => {
    const r = bd('consultar', 'DELETE FROM GESTARMAZEM.TDCAIXA WHERE PIID = 1');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/so aceita SELECT/i);
  });

  it('recusa um SELECT com DML colado a seguir', () => {
    const r = bd('consultar', 'SELECT 1 FROM dual; DELETE FROM GESTARMAZEM.TDCAIXA');
    expect(r.status).toBe(2);
  });
});

describe('escrever', () => {
  it('recusa SQL sem o marcador', () => {
    const r = bd('escrever', 'INSERT INTO GESTARMAZEM.TDCAIXA (PIID) VALUES (1)');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/marcador/i);
  });

  it('recusa DROP mesmo com marcador', () => {
    const r = bd('escrever', 'DROP TABLE X -- AGENTE-20260819-teste');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/DROP|TRUNCATE|ALTER/);
  });

  it('recusa TRUNCATE mesmo com marcador', () => {
    const r = bd('escrever', 'TRUNCATE TABLE X -- AGENTE-20260819-teste');
    expect(r.status).toBe(2);
  });

  it('sem marcador no ambiente, sai com 3: escrever sem marcador deixa massa por limpar', () => {
    const r = spawnSync('bash', ['scripts/bd.sh', 'escrever', "INSERT INTO X VALUES ('a')"], {
      encoding: 'utf8',
      env: { ...process.env, CCMSNS_BD_LIGACAO: 'u/s@//h:1521/ACCQUA', CCMSNS_BD_MARCADOR: '' },
    });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/CCMSNS_BD_MARCADOR/);
  });
});
