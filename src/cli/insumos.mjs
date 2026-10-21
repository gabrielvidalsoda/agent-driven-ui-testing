import { pathToFileURL } from 'node:url';
import { carregarConfigCorrida } from '../config.mjs';
import { sincronizarFontes } from '../insumos-sincronizar.mjs';
import { refsDe, caminhoDeRef } from '../insumos.mjs';
import { existsSync } from 'node:fs';

// Sincroniza as fontes e diz, documento a documento, que requisitos vao entrar no enunciado e
// se estao mesmo la. Correr isto antes de uma noite custa zero e evita bloqueios pagos.
function principal() {
  const resto = process.argv.slice(2);
  const opcao = (nome, omissao) => {
    const i = resto.indexOf(nome);
    return i >= 0 ? resto[i + 1] : omissao;
  };
  const config = carregarConfigCorrida(opcao('--config', 'config/corrida.yaml'));
  const raizCache = config.insumos.cache;
  sincronizarFontes(config, { raizCache });

  let emFalta = 0;
  for (const documento of [...config.alvos.keys()].sort()) {
    const refs = refsDe(config.insumos, documento);
    if (refs.length === 0) continue;
    console.log(documento);
    for (const ref of refs) {
      const caminho = caminhoDeRef(config.insumos, ref, raizCache);
      const ok = existsSync(caminho);
      if (!ok) emFalta += 1;
      console.log(`  ${ok ? 'ok  ' : 'FALTA'} ${ref}`);
    }
  }
  if (emFalta > 0) {
    console.error(`${emFalta} insumos em falta: os documentos que os declaram ficam bloqueados`);
    process.exit(1);
  }
}

export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  principal();
}
