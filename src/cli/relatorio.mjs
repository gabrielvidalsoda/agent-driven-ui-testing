import { carregarConfigCorrida } from '../config.mjs';
import { escreverRelatorios } from '../relatorio/escrever.mjs';

// A pasta das corridas e os títulos das sessões saem do mesmo `--config` que as corridas usam.
// Estavam aqui em duro (`corridas`, `config/sessoes.yaml`), o que era verdade enquanto houve um
// produto só: com dois, este comando ia buscar o relatório de um à pasta do outro e dizia que
// não existia corrida nenhuma.
const [data, sessao, ...resto] = process.argv.slice(2).filter((a) => a !== '--config');
const iConfig = process.argv.indexOf('--config');
const caminhoConfig = iConfig >= 0 ? process.argv[iConfig + 1] : 'config/corrida.yaml';

if (!data) {
  console.error('uso: npm run relatorio -- <data> [sessao] [--config config/corrida.yaml]');
  console.error('exemplo: npm run relatorio -- 2026-08-18 gestao-armazem');
  process.exit(1);
}

// O caminho do --config vem no mesmo saco dos posicionais; se calhou em `sessao`, não é sessão.
const sessaoEscolhida = sessao === caminhoConfig ? undefined : sessao;
void resto;

const config = carregarConfigCorrida(caminhoConfig);

try {
  const { indice, sessoes, modelo } = escreverRelatorios(
    config.pasta_corridas, data, config.sessoes, sessaoEscolhida,
  );
  for (const caminho of sessoes) console.log(`  ✓ ${caminho}`);
  console.log(`  ✓ ${indice}`);
  console.log(
    `\n${modelo.sessoes.length} sessão(ões), ${modelo.contagens.total} caso(s): ` +
      `${modelo.contagens.passa} passa · ${modelo.contagens.falha} falha · ` +
      `${modelo.contagens.bloqueado} bloqueado · ${modelo.contagens.nao_aplicavel} não aplicável`,
  );
} catch (erro) {
  console.error(`✗ ${erro.message}`);
  process.exit(1);
}
