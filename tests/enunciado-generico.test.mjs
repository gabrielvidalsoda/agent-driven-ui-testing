import { describe, it, expect } from 'vitest';
import { montarEnunciado } from '../src/enunciado.mjs';

function enunciado(extra = {}) {
  return montarEnunciado({
    documento: 'area/tela.md',
    texto: '# Cenários\n\nCT-01 abrir a tela',
    url: 'https://hom.exemplo/tela',
    pastaEvidencias: '/tmp/ev',
    marcador: 'AGENTE-20260905-tela',
    mapa: null,
    nivel: 3,
    ...extra,
  });
}

const AUTENTICACAO = {
  url: 'https://hom.exemplo/login',
  campo_utilizador: 'Usuário',
  campo_senha: 'Senha',
  submeter: 'Entrar',
  prova: 'o menu lateral',
  passos: null,
  utilizador: 'ana@exemplo',
  senha: 'segredo-ana',
  descricao: 'perfil Analista',
};

describe('nome do produto', () => {
  it('põe no enunciado o produto configurado', () => {
    expect(enunciado({ produto: 'ScopePilot' })).toContain('uma tela do ScopePilot');
  });

  it('sem produto configurado não nomeia nenhum', () => {
    expect(enunciado()).toContain('uma tela do aplicação');
  });
});

describe('autenticação', () => {
  it('manda entrar antes de tudo, com as credenciais e a prova', () => {
    const texto = enunciado({ autenticacao: AUTENTICACAO });
    expect(texto).toContain('AUTENTICAÇÃO: FAZ ISTO ANTES DE TUDO');
    expect(texto).toContain('https://hom.exemplo/login');
    expect(texto).toContain('«Usuário»: ana@exemplo');
    expect(texto).toContain('«Senha»: segredo-ana');
    expect(texto).toContain('Carrega em «Entrar»');
    expect(texto).toContain('o menu lateral');
  });

  // Falhar a entrada e continuar a percorrer a aplicacao deslogado da uma resposta cheia de
  // falsos defeitos que custa o mesmo que uma boa.
  it('manda parar em bloqueado quando não conseguir entrar', () => {
    expect(enunciado({ autenticacao: AUTENTICACAO })).toMatch(/NÃO CONSEGUIRES ENTRAR.*"bloqueado"/s);
  });

  it('sem autenticação, o enunciado não fala de entrar', () => {
    expect(enunciado()).not.toContain('AUTENTICAÇÃO');
  });

  it('inclui os passos adicionais quando estão declarados', () => {
    const texto = enunciado({ autenticacao: { ...AUTENTICACAO, passos: 'escolher a empresa mptec' } });
    expect(texto).toContain('escolher a empresa mptec');
  });
});

describe('navegação sem rota', () => {
  it('diz de onde parte e por onde vai quando a tela não tem rota própria', () => {
    const texto = enunciado({ url: 'https://hom.exemplo', navegacao: 'menu lateral → Projetos → aba Pendências' });
    expect(texto).toContain('Entras em https://hom.exemplo e chegas à tela assim: menu lateral → Projetos → aba Pendências');
  });

  it('com rota própria diz só onde a tela está', () => {
    expect(enunciado()).toContain('A tela está em https://hom.exemplo/tela.');
  });
});

describe('documentação funcional', () => {
  it('manda derivar os casos e cobrir o documento todo', () => {
    const texto = enunciado({ tipoDocumento: 'funcional' });
    expect(texto).toContain('NÃO É UM GUIÃO DE TESTE');
    expect(texto).toContain('COBRE O DOCUMENTO TODO');
    expect(texto).toContain('=== DOCUMENTAÇÃO FUNCIONAL ===');
  });

  // O que nao se ve no ecra nao da caso nenhum: sem isto o agente enche a resposta de
  // bloqueados sobre tabelas e integracoes que nunca poderia observar.
  it('manda saltar o que não se observa no ecrã', () => {
    expect(enunciado({ tipoDocumento: 'funcional' })).toMatch(/tabelas, filas, prompts.*NÃO DÁ CASO NENHUM/s);
  });

  it('um documento de cenários continua a mandar no esperado', () => {
    const texto = enunciado();
    expect(texto).toContain('O DOCUMENTO MANDA NO ESPERADO');
    expect(texto).toContain('=== DOCUMENTO DE CENÁRIOS ===');
  });
});

// A regra de limpeza fala de registos na aplicacao. Um agente que a leia em sentido lato
// apaga a pasta de trabalho, e a evidencia da corrida vai atras.
describe('limpeza no fim', () => {
  it('diz que a limpeza é de registos e nunca dos ficheiros de evidência', () => {
    const texto = enunciado();
    expect(texto).toMatch(/REGISTOS DA APLICAÇÃO e mais nada/);
    expect(texto).toMatch(/EVIDÊNCIA da corrida e ficam todos onde estão/);
  });
});

// Um caso sem veredicto invalida a resposta inteira, e com ela uma corrida ja paga.
describe('veredicto obrigatório', () => {
  it('avisa em voz alta que um caso sem veredicto deita fora a resposta toda', () => {
    const texto = enunciado();
    expect(texto).toMatch(/TODO O CASO LEVA "veredicto", sem exceção/);
    expect(texto).toMatch(/invalida a RESPOSTA INTEIRA/);
  });
});
