import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

// Aplicacoes com autenticacao sao a regra fora do ambiente local. O ficheiro descreve DUAS
// coisas separadas: como se entra (o formulario, igual para toda a gente) e quem entra (os
// perfis, um por papel). Separadas porque o formulario nao muda quando se troca de papel, e
// juntar as duas obrigaria a repetir os seletores em cada perfil.
//
// O ficheiro nao entra no git: leva senhas de ambientes reais. Ao lado dele fica um
// `credenciais.yaml.exemplo`, esse sim versionado, para quem clona saber o que preencher.
const VAZIA = () => ({ autenticacao: null, perfis: new Map(), omissao: null });

export function carregarCredenciais(caminhoYaml) {
  if (!existsSync(caminhoYaml)) return VAZIA();
  const cru = parse(readFileSync(caminhoYaml, 'utf8')) ?? {};
  const config = VAZIA();

  const perfis = Object.entries(cru.perfis ?? {});
  for (const [nome, valor] of perfis) {
    // Um perfil a que falte a senha e pior do que perfil nenhum: o agente tentava entrar,
    // falhava, e o documento saia bloqueado com um custo ja pago. Rebenta ao carregar.
    if (!valor?.utilizador || !valor?.senha) {
      throw new Error(`perfil ${nome}: falta utilizador ou senha em credenciais.yaml`);
    }
    config.perfis.set(nome, {
      nome,
      utilizador: String(valor.utilizador),
      senha: String(valor.senha),
      descricao: valor.descricao ?? null,
    });
  }

  if (cru.autenticacao) {
    config.autenticacao = {
      url: cru.autenticacao.url ?? null,
      campo_utilizador: cru.autenticacao.campo_utilizador ?? 'Utilizador',
      campo_senha: cru.autenticacao.campo_senha ?? 'Senha',
      submeter: cru.autenticacao.submeter ?? 'Entrar',
      prova: cru.autenticacao.prova ?? null,
      passos: cru.autenticacao.passos ?? null,
    };
  }

  config.omissao = cru.perfil_omissao ?? (perfis.length === 1 ? perfis[0][0] : null);
  if (config.omissao && !config.perfis.has(config.omissao)) {
    throw new Error(`perfil_omissao ${config.omissao} nao esta declarado em credenciais.yaml`);
  }
  return config;
}

export function perfilDe(config, nome = null) {
  const escolhido = nome ?? config.omissao;
  if (!escolhido) return null;
  const perfil = config.perfis.get(escolhido);
  if (!perfil) throw new Error(`a credencial ${escolhido} nao esta declarada em credenciais.yaml`);
  return perfil;
}

// O que o enunciado precisa: o formulario e o par de credenciais, ja resolvidos. Devolve nulo
// quando a aplicacao nao tem autenticacao — e o caso da UI local, servida sem login nenhum.
export function autenticacaoPara(config, nome = null) {
  if (!config?.autenticacao) return null;
  const perfil = perfilDe(config, nome);
  if (!perfil) throw new Error('ha autenticacao declarada mas nenhum perfil para entrar com ela');
  return { ...config.autenticacao, ...perfil };
}
