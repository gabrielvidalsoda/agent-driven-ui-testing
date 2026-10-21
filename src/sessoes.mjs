import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function carregarSessoes(caminhoYaml) {
  const cru = parse(readFileSync(caminhoYaml, 'utf8'));
  const mapa = new Map();
  for (const [id, valor] of Object.entries(cru?.sessoes ?? {})) {
    mapa.set(id, {
      titulo: valor?.titulo ?? id,
      paralelo: Boolean(valor?.paralelo),
      // Quantos documentos ao mesmo tempo. Só conta em sessões paralelas; omitido, vale o
      // limite por omissão do executor.
      concorrencia: valor?.concorrencia ?? undefined,
      perfil: valor?.perfil ?? {},
      // Com que credencial se entra nesta sessao. Omitido, vale o perfil_omissao do
      // credenciais.yaml — o caso comum, em que a suite inteira corre com um utilizador so.
      credencial: valor?.credencial,
    });
  }
  return mapa;
}

export function sessaoDe(mapa, id) {
  const sessao = mapa.get(id);
  if (!sessao) throw new Error(`a sessão ${id} não está em sessoes.yaml`);
  return sessao;
}

// Aviso e não erro: o menu tem secções sem documentos de cenário, e há documentos cuja área
// não é secção de topo. Falhar aqui impediria a suite de correr por uma discrepância legítima.
export function divergenciasComMenu(mapa, seccoes) {
  const noMenu = new Set(seccoes.map((s) => s.id));
  const avisos = [];
  for (const id of noMenu) {
    if (!mapa.has(id)) avisos.push(`o menu tem a secção ${id} e o sessoes.yaml não a declara`);
  }
  for (const id of mapa.keys()) {
    if (!noMenu.has(id)) avisos.push(`a sessão ${id} não é secção de topo do menu`);
  }
  return avisos;
}
