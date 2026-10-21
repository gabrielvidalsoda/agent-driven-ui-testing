import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VERSAO_MCP = '@playwright/mcp@0.0.79';

// --isolated: perfil em memória, nunca partilhado entre agentes.
// --block-service-workers está deliberadamente ausente: foi o que escondeu o defeito 5.5
// da PoC (ecrã branco no arranque). Queremos que esse defeito apareça, não que seja evitado.
//
// O perfil da sessão entra por --storage-state e --secrets, e não por --user-data-dir: um
// diretório de dados não coexiste com --isolated e só admite um Chrome de cada vez, o que
// impediria dois agentes da mesma sessão de correrem ao mesmo tempo. O storage state é um
// ficheiro lido no arranque, portanto vários agentes partilham o mesmo perfil sem se trancarem.
// `visivel` abre uma janela de browser a serio, para acompanhar o agente com os olhos. Custa
// mais e rouba o foco do teclado, portanto e para depurar um documento, nunca para a noite.
export function configMcp({ pastaSaida, imagens = 'allow', perfil = {}, visivel = false }) {
  return {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: [
          '-y', VERSAO_MCP,
          ...(visivel ? [] : ['--headless']),
          '--isolated',
          '--browser', 'chrome',
          '--viewport-size', '1600x950',
          '--output-dir', pastaSaida,
          '--image-responses', imagens,
          ...(perfil.storage_state ? ['--storage-state', perfil.storage_state] : []),
          ...(perfil.secrets ? ['--secrets', perfil.secrets] : []),
        ],
      },
    },
  };
}

export function escreverConfigMcp(pastaTrabalho, opcoes) {
  const caminho = join(pastaTrabalho, 'mcp.json');
  writeFileSync(caminho, JSON.stringify(configMcp(opcoes), null, 2), 'utf8');
  return caminho;
}
