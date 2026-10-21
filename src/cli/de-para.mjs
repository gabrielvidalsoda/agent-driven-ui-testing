import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { carregarConfigCorrida } from '../config.mjs';
import { recolherDia } from '../relatorio/recolher.mjs';
import { dePara, tabelaMarkdown, sugestaoAlvos } from '../de-para.mjs';

export function montarDocumento({ data, linhas, baseUrl }) {
  const diretas = linhas.filter((l) => l.entrada && !l.parametrizada).length;
  const entradas = linhas.filter((l) => l.entrada).length;
  return `# De-para documento → tela

Corrida de **${data}**, contra ${baseUrl}. ${linhas.length} tela(s) em ${entradas} documento(s);
**${diretas}** com rota direta, que a próxima corrida pode abrir sem procurar pelo menu.

${tabelaMarkdown(linhas)}
## Para o alvos.yaml

Colar por cima das entradas correspondentes, depois de conferir. **Não foi escrito
automaticamente**: uma rota errada posta em silêncio é pior do que um branco, porque quem revê o
alvos.yaml corrige os brancos e confia no que lá está preenchido.

\`\`\`yaml
${sugestaoAlvos(linhas)}\`\`\`
`;
}

async function principal() {
  const [data, ...resto] = process.argv.slice(2);
  if (!data) {
    console.error('uso: npm run de-para -- <AAAA-MM-DD> [--config config/corrida.yaml]');
    process.exit(2);
  }
  const i = resto.indexOf('--config');
  const config = carregarConfigCorrida(i >= 0 ? resto[i + 1] : 'config/corrida.yaml');

  const dia = recolherDia(config.pasta_corridas, data, config.sessoes);
  const linhas = dePara(dia.sessoes.flatMap((s) => s.documentos), config.base_url);
  if (!linhas.length) {
    console.error(`nenhuma tela registada em ${data}: as corridas são anteriores a "telas_visitadas"`);
    process.exit(1);
  }

  const caminho = join(config.pasta_corridas, data, 'de-para.md');
  writeFileSync(caminho, montarDocumento({ data, linhas, baseUrl: config.base_url }), 'utf8');
  console.error(`de-para: ${caminho}`);
  console.log(tabelaMarkdown(linhas));
}

export function foiInvocadoComoComando() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (foiInvocadoComoComando()) {
  await principal();
}
