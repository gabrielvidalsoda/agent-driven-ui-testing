import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configMcp, escreverConfigMcp } from '../src/mcp.mjs';

describe('configMcp', () => {
  it('corre headless e isolado', () => {
    const args = configMcp({ pastaSaida: '/tmp/x', imagens: 'allow' }).mcpServers.playwright.args;
    expect(args).toContain('--headless');
    expect(args).toContain('--isolated');
  });

  it('fixa a versão do @playwright/mcp', () => {
    const args = configMcp({ pastaSaida: '/tmp/x', imagens: 'allow' }).mcpServers.playwright.args;
    expect(args).toContain('@playwright/mcp@0.0.79');
  });

  it('nunca bloqueia service workers', () => {
    const args = configMcp({ pastaSaida: '/tmp/x', imagens: 'allow' }).mcpServers.playwright.args;
    expect(args).not.toContain('--block-service-workers');
  });

  it('passa a pasta de saída e o modo das imagens', () => {
    const args = configMcp({ pastaSaida: '/tmp/x', imagens: 'omit' }).mcpServers.playwright.args;
    expect(args).toContain('--output-dir');
    expect(args).toContain('/tmp/x');
    expect(args.join(' ')).toContain('--image-responses omit');
  });
});

describe('escreverConfigMcp', () => {
  it('escreve um JSON legível no disco', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
    const caminho = escreverConfigMcp(dir, { pastaSaida: dir, imagens: 'allow' });
    expect(JSON.parse(readFileSync(caminho, 'utf8')).mcpServers.playwright.command).toBe('npx');
  });
});

describe('perfil da sessão', () => {
  it('sem perfil, os argumentos são os de sempre', () => {
    const semPerfil = configMcp({ pastaSaida: '/tmp/x', imagens: 'allow' }).mcpServers.playwright.args;
    const comVazio = configMcp({ pastaSaida: '/tmp/x', imagens: 'allow', perfil: {} }).mcpServers.playwright.args;
    expect(comVazio).toEqual(semPerfil);
  });

  it('o storage state entra como --storage-state', () => {
    const args = configMcp({
      pastaSaida: '/tmp/x',
      imagens: 'allow',
      perfil: { storage_state: '/perfis/armazem.json' },
    }).mcpServers.playwright.args;
    expect(args.join(' ')).toContain('--storage-state /perfis/armazem.json');
  });

  it('os segredos entram como --secrets', () => {
    const args = configMcp({
      pastaSaida: '/tmp/x',
      imagens: 'allow',
      perfil: { secrets: '/perfis/armazem.env' },
    }).mcpServers.playwright.args;
    expect(args.join(' ')).toContain('--secrets /perfis/armazem.env');
  });

  it('o utilizador é documental e não vai para a linha de comandos', () => {
    const args = configMcp({
      pastaSaida: '/tmp/x',
      imagens: 'allow',
      perfil: { utilizador: 'supervisor.armazem' },
    }).mcpServers.playwright.args;
    expect(args.join(' ')).not.toContain('supervisor.armazem');
  });

  it('mantém --isolated mesmo com perfil', () => {
    const args = configMcp({
      pastaSaida: '/tmp/x',
      imagens: 'allow',
      perfil: { storage_state: '/perfis/armazem.json' },
    }).mcpServers.playwright.args;
    expect(args).toContain('--isolated');
  });
});

describe('browser visível', () => {
  it('por omissão corre headless', () => {
    expect(configMcp({ pastaSaida: '/tmp/x' }).mcpServers.playwright.args).toContain('--headless');
  });

  it('com visivel abre janela e deixa cair o headless', () => {
    const args = configMcp({ pastaSaida: '/tmp/x', visivel: true }).mcpServers.playwright.args;
    expect(args).not.toContain('--headless');
    expect(args).toContain('--isolated');
  });
});
