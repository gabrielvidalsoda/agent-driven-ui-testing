import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { carregarCredenciais, perfilDe, autenticacaoPara } from '../src/credenciais.mjs';

function ficheiroTemporario(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), 'credenciais-'));
  const caminho = join(dir, 'credenciais.yaml');
  writeFileSync(caminho, conteudo, 'utf8');
  return caminho;
}

const DOIS_PERFIS = `
autenticacao:
  url: https://hom.exemplo/login
  campo_utilizador: Usuário
  campo_senha: Senha
  submeter: Entrar
  prova: o menu lateral com o nome do utilizador

perfil_omissao: analista
perfis:
  analista:
    descricao: perfil Analista
    utilizador: ana@exemplo
    senha: segredo-ana
  admin:
    utilizador: adm@exemplo
    senha: segredo-adm
`;

describe('carregarCredenciais', () => {
  it('carrega o formulário de entrada e os perfis', () => {
    const config = carregarCredenciais(ficheiroTemporario(DOIS_PERFIS));
    expect(config.autenticacao.url).toBe('https://hom.exemplo/login');
    expect(config.autenticacao.campo_utilizador).toBe('Usuário');
    expect([...config.perfis.keys()]).toEqual(['analista', 'admin']);
    expect(config.omissao).toBe('analista');
  });

  // A suite corria sem credenciais antes de elas existirem — contra a UI local, servida sem
  // login nenhum — e tem de continuar a correr.
  it('sem ficheiro, devolve configuração vazia em vez de rebentar', () => {
    const config = carregarCredenciais(join(tmpdir(), 'nao-existe-credenciais.yaml'));
    expect(config.autenticacao).toBeNull();
    expect(config.perfis.size).toBe(0);
  });

  // Um perfil incompleto só se descobria a meio de uma corrida ja paga: o agente tentava
  // entrar, falhava, e o documento saia bloqueado.
  it('rebenta ao carregar um perfil sem senha', () => {
    const caminho = ficheiroTemporario('perfis:\n  analista:\n    utilizador: ana@exemplo\n');
    expect(() => carregarCredenciais(caminho)).toThrow(/analista.*utilizador ou senha/s);
  });

  it('com um perfil só, ele é o de omissão sem ser preciso declará-lo', () => {
    const caminho = ficheiroTemporario('perfis:\n  unico:\n    utilizador: u\n    senha: s\n');
    expect(carregarCredenciais(caminho).omissao).toBe('unico');
  });

  it('rebenta quando o perfil_omissao não existe', () => {
    const caminho = ficheiroTemporario('perfil_omissao: fantasma\nperfis:\n  real:\n    utilizador: u\n    senha: s\n');
    expect(() => carregarCredenciais(caminho)).toThrow(/fantasma.*nao esta declarado/s);
  });
});

describe('perfilDe', () => {
  it('escolhe o perfil pedido, e o de omissão quando não se pede nenhum', () => {
    const config = carregarCredenciais(ficheiroTemporario(DOIS_PERFIS));
    expect(perfilDe(config, 'admin').utilizador).toBe('adm@exemplo');
    expect(perfilDe(config).utilizador).toBe('ana@exemplo');
  });

  it('rebenta com o nome de uma credencial que não existe', () => {
    const config = carregarCredenciais(ficheiroTemporario(DOIS_PERFIS));
    expect(() => perfilDe(config, 'ninguem')).toThrow(/ninguem.*nao esta declarada/s);
  });
});

describe('autenticacaoPara', () => {
  it('junta o formulário ao par de credenciais', () => {
    const config = carregarCredenciais(ficheiroTemporario(DOIS_PERFIS));
    expect(autenticacaoPara(config, 'admin')).toMatchObject({
      url: 'https://hom.exemplo/login',
      campo_senha: 'Senha',
      utilizador: 'adm@exemplo',
      senha: 'segredo-adm',
    });
  });

  it('sem autenticação declarada devolve nulo — é a aplicação sem login', () => {
    expect(autenticacaoPara(carregarCredenciais(join(tmpdir(), 'nao-existe.yaml')))).toBeNull();
  });

  // Declarar como se entra sem dizer quem entra deixaria o agente a olhar para um formulario
  // que nao sabe preencher.
  it('rebenta quando há formulário mas não há perfil nenhum', () => {
    const caminho = ficheiroTemporario('autenticacao:\n  url: https://hom.exemplo/login\n');
    expect(() => autenticacaoPara(carregarCredenciais(caminho))).toThrow(/nenhum perfil/);
  });
});
