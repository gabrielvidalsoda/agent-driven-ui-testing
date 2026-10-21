import { describe, it, expect } from 'vitest';
import { montarEnunciadoMapa } from '../src/enunciado-mapa.mjs';

const ARGS = {
  documento: 'gestao-armazem/registo-entrada.md',
  texto: '# Registo de Entrada\n\n## CT-01 Pesquisar\n## CT-05 Concluir registo\n',
  url: 'http://localhost:4174/armazem/registo-entrada',
  pastaEvidencias: 'C:/corridas/mapa',
  versoes: { ui: '30446d5', api: 'jar de develop' },
};

describe('montarEnunciadoMapa', () => {
  const enunciado = montarEnunciadoMapa(ARGS);

  it('proibe escrever e submeter', () => {
    expect(enunciado).toMatch(/NÃO SUBMETES/);
    expect(enunciado).toMatch(/não escreves na\s+base de dados/i);
  });

  it('manda cruzar as accoes com os CT-nn e listar os que nao tem accao', () => {
    expect(enunciado).toMatch(/casos_sem_accao/);
    expect(enunciado).toMatch(/casos_documento/);
  });

  it('diz que a promessa e da tela e nao do documento', () => {
    expect(enunciado).toMatch(/promessa/);
    expect(enunciado).toMatch(/o que a tela promete/i);
  });

  it('leva o documento, o url e as versoes', () => {
    expect(enunciado).toContain(ARGS.texto);
    expect(enunciado).toContain(ARGS.url);
    expect(enunciado).toContain('30446d5');
  });

  it('leva o esquema do mapa', () => {
    expect(enunciado).toMatch(/insumos_necessarios/);
    expect(enunciado).toMatch(/exportacao/);
  });

  it('fixa o nome do documento, para a resposta nao vir com outro', () => {
    expect(enunciado).toContain('tem de ser exatamente: gestao-armazem/registo-entrada.md');
  });
});
