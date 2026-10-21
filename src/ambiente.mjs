// Uma corrida contra um ambiente meio de pé é pior do que corrida nenhuma: o agente percorre
// a tela, não obtém dados, e devolve bloqueios que se leem de manhã como falta de massa. Foi o
// que aconteceu a 2026-08-18, quando a VPN caiu a meio e um documento inteiro saiu bloqueado.
//
// A sonda tem de bater na API, nunca numa rota da tela: o servidor de preview devolve o
// index.html da SPA para qualquer caminho, portanto uma rota de tela responde 200 com a
// aplicacao inteira em baixo por tras. Aprendido a 2026-08-18, a lancar um agente por engano.
//
// Tao-pouco serve o /health do core-api, que fica DOWN por causa do RabbitMQ sem isso impedir
// nada. Serve um endpoint que va mesmo a base de dados: e a base que cai com a VPN.
//
// Um 4xx conta como vivo. A sonda pergunta "ha alguem do outro lado com acesso a base?", e um
// pedido meu mal formado responde a isso tao bem como um 200; sao os 5xx e o silencio que
// dizem que nao.
export async function verificarAmbiente({ url, timeoutMs = 20000 }, deps = {}) {
  const buscar = deps.buscar ?? fetch;
  try {
    const resposta = await buscar(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (resposta.status >= 500) return { ok: false, razao: `${url} respondeu ${resposta.status}` };
    return { ok: true, razao: null };
  } catch (erro) {
    const causa = erro?.name === 'TimeoutError' ? `não respondeu em ${timeoutMs}ms` : erro.message;
    return { ok: false, razao: `${url} ${causa}` };
  }
}
