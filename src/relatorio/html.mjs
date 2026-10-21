import { VEREDICTOS } from './recolher.mjs';

const ROTULOS = {
  passa: 'Passa',
  falha: 'Falha',
  bloqueado: 'Bloqueado',
  nao_aplicavel: 'Não aplicável',
};

// nao_aplicavel tem cor própria e não se confunde com bloqueado: um caso que não se aplica é uma
// decisão de âmbito, um bloqueado é trabalho por fazer. Foi a distinção que o gestor pediu.
const CORES = {
  passa: '#2e7d5b',
  falha: '#c0392b',
  bloqueado: '#b7791f',
  nao_aplicavel: '#5b6b7c',
};

export function htmlSessao(sessao, data) {
  const itens = [
    { chave: 'resumo', rotulo: 'Resumo geral' },
    ...sessao.documentos.map((d) => ({ chave: d.id, rotulo: nomeCurto(d) })),
  ];

  const corpo = `
    <div class="colunas">
      <nav class="lista" role="tablist" aria-label="Telas da sessão">
        ${itens
          .map(
            (i, n) => `<button role="tab" class="item${n === 0 ? ' activo' : ''}"
                 aria-selected="${n === 0}" data-alvo="${escapar(i.chave)}">${escapar(i.rotulo)}</button>`,
          )
          .join('\n        ')}
      </nav>
      <main class="painel">
        <section id="p-resumo" class="pagina activa">
          ${resumoDaSessao(sessao, data)}
        </section>
        ${sessao.documentos.map((d) => `<section id="p-${escapar(d.id)}" class="pagina">${paginaDocumento(d)}</section>`).join('\n        ')}
      </main>
    </div>`;

  return moldura({
    titulo: `${sessao.titulo} — ${data}`,
    cabecalho: `<a class="voltar" href="../index.html">← Todas as sessões de ${escapar(data)}</a>
      <h1>${escapar(sessao.titulo)}</h1>
      <p class="sub">${escapar(data)} · ${sessao.documentos.length} tela(s) · ${sessao.contagens.total} caso(s)${estadoSessao(sessao)}</p>`,
    corpo,
    script: SCRIPT_ABAS,
  });
}

export function htmlIndice(modelo) {
  const linhas = modelo.sessoes
    .map(
      (s) => `<tr>
        <td><a href="${escapar(s.id)}/relatorio.html">${escapar(s.titulo)}</a></td>
        <td class="num">${s.documentos.length}</td>
        <td class="num">${s.contagens.total}</td>
        <td>${barra(s.contagens)}</td>
        <td class="num">${percentagem(s.contagens)}</td>
        <td class="num">${custo(s.metricas)}</td>
      </tr>`,
    )
    .join('\n      ');

  const corpo = `
    <section class="cartoes">
      ${cartao('Sessões', modelo.sessoes.length)}
      ${cartao('Telas', modelo.sessoes.reduce((n, s) => n + s.documentos.length, 0))}
      ${cartao('Casos', modelo.contagens.total)}
      ${cartao('Passa', percentagem(modelo.contagens), CORES.passa)}
      ${cartao('Custo', custo(modelo.metricas))}
    </section>

    <section class="bloco">
      <h2>Distribuição do dia</h2>
      <div class="grafico">${rosca(modelo.contagens)}${legenda(modelo.contagens)}</div>
    </section>

    <section class="bloco">
      <h2>Por sessão</h2>
      <table>
        <thead><tr><th>Sessão</th><th class="num">Telas</th><th class="num">Casos</th>
          <th>Veredictos</th><th class="num">Passa</th><th class="num">Custo</th></tr></thead>
        <tbody>
      ${linhas || '<tr><td colspan="6" class="vazio">Sem sessões nesta data.</td></tr>'}
        </tbody>
      </table>
    </section>`;

  return moldura({
    titulo: `Corrida de ${modelo.data}`,
    cabecalho: `<h1>Corrida de ${escapar(modelo.data)}</h1>
      <p class="sub">${modelo.sessoes.length} sessão(ões) · ${modelo.contagens.total} caso(s)</p>`,
    corpo,
  });
}

function resumoDaSessao(sessao, data) {
  const porTela = sessao.documentos
    .map(
      (d) => `<tr>
        <td><a href="#" data-ir="${escapar(d.id)}">${escapar(nomeCurto(d))}</a></td>
        <td class="num">${d.contagens.total}</td>
        <td>${barra(d.contagens)}</td>
        <td class="num">${percentagem(d.contagens)}</td>
        <td class="num">${d.achados.length}</td>
      </tr>`,
    )
    .join('\n        ');

  return `
    <section class="cartoes">
      ${cartao('Telas', sessao.documentos.length)}
      ${cartao('Casos', sessao.contagens.total)}
      ${cartao('Passa', percentagem(sessao.contagens), CORES.passa)}
      ${cartao('Achados', sessao.documentos.reduce((n, d) => n + d.achados.length, 0))}
      ${cartao('Custo', custo(sessao.metricas))}
    </section>

    <section class="bloco">
      <h2>Distribuição da sessão</h2>
      <div class="grafico">${rosca(sessao.contagens)}${legenda(sessao.contagens)}</div>
    </section>

    ${
      sessao.porCorrer?.length
        ? `<section class="bloco aviso"><h2>Por correr</h2><ul>${sessao.porCorrer
            .map((d) => `<li>${escapar(d)}</li>`)
            .join('')}</ul>${sessao.razao ? `<p>${escapar(sessao.razao)}</p>` : ''}</section>`
        : ''
    }

    <section class="bloco">
      <h2>Por tela</h2>
      <table>
        <thead><tr><th>Tela</th><th class="num">Casos</th><th>Veredictos</th>
          <th class="num">Passa</th><th class="num">Achados</th></tr></thead>
        <tbody>
        ${porTela || `<tr><td colspan="5" class="vazio">Sem telas nesta sessão em ${escapar(data)}.</td></tr>`}
        </tbody>
      </table>
    </section>`;
}

function paginaDocumento(d) {
  return `
    <h2>${escapar(nomeCurto(d))}</h2>
    <p class="sub">${escapar(d.documento)} · ${escapar(d.estado)} · ${d.contagens.total} caso(s) · ${custo(d.metricas)}</p>
    <div class="grafico">${rosca(d.contagens)}${legenda(d.contagens)}</div>

    ${d.avisos.length ? blocoLista('Avisos', d.avisos, 'aviso') : ''}
    ${d.notasAmbiente.length ? blocoLista('Notas de ambiente', d.notasAmbiente) : ''}

    <h3>Casos</h3>
    ${d.casos.map(caso).join('\n    ') || '<p class="vazio">Sem casos.</p>'}

    ${
      d.achados.length
        ? `<h3>Achados</h3>${d.achados
            .map(
              (a) => `<article class="achado">
          <h4>${escapar(a.titulo ?? '(sem título)')}</h4>
          ${a.confianca ? `<p class="etiqueta">confiança: ${escapar(a.confianca)}</p>` : ''}
          <p>${escapar(a.descricao ?? '')}</p>
          ${a.reproducao ? `<p><strong>Reprodução:</strong> ${escapar(a.reproducao)}</p>` : ''}
        </article>`,
            )
            .join('\n    ')}`
        : ''
    }

    ${
      d.registos.length
        ? `<h3>Registos criados</h3><table>
        <thead><tr><th>Descrição</th><th>Identificação</th><th>Removido</th></tr></thead>
        <tbody>${d.registos
          .map(
            (r) => `<tr><td>${escapar(r.descricao ?? '')}</td><td>${escapar(r.identificacao ?? '')}</td>
            <td>${r.removido ? 'sim' : `não${r.razao ? ` — ${escapar(r.razao)}` : ''}`}</td></tr>`,
          )
          .join('')}</tbody></table>`
        : ''
    }`;
}

function caso(c) {
  return `<article class="caso ${c.veredicto}">
      <header><span class="id">${escapar(c.id)}</span>
        <span class="selo" style="background:${CORES[c.veredicto]}">${ROTULOS[c.veredicto]}</span></header>
      <dl>
        <dt>Esperado</dt><dd>${escapar(c.esperado)}</dd>
        <dt>Observado</dt><dd>${escapar(c.observado)}</dd>
      </dl>
      ${
        c.evidencia.length
          ? `<div class="capturas">${c.evidencia
              .map(
                (f) =>
                  `<a href="${escapar(f)}" target="_blank" rel="noopener"><img src="${escapar(f)}" alt="Evidência de ${escapar(c.id)}" loading="lazy"></a>`,
              )
              .join('')}</div>`
          : ''
      }
    </article>`;
}

function blocoLista(titulo, itens, classe = '') {
  return `<section class="bloco ${classe}"><h3>${escapar(titulo)}</h3><ul>${itens
    .map((i) => `<li>${escapar(String(i))}</li>`)
    .join('')}</ul></section>`;
}

function cartao(rotulo, valor, cor = null) {
  return `<div class="cartao"><span class="rotulo">${escapar(rotulo)}</span>
    <strong style="${cor ? `color:${cor}` : ''}">${escapar(String(valor))}</strong></div>`;
}

// Rosca em SVG à mão: um arco por veredicto, com stroke-dasharray sobre uma circunferência
// conhecida. Sem biblioteca — o relatório abre de um ficheiro, sem rede.
function rosca(contagens) {
  const total = contagens.total;
  const r = 54;
  const perimetro = 2 * Math.PI * r;
  let offset = 0;
  const arcos = VEREDICTOS.filter((v) => contagens[v] > 0)
    .map((v) => {
      const fatia = (contagens[v] / total) * perimetro;
      const arco = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${CORES[v]}" stroke-width="22"
        stroke-dasharray="${fatia.toFixed(2)} ${(perimetro - fatia).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)"><title>${ROTULOS[v]}: ${contagens[v]}</title></circle>`;
      offset += fatia;
      return arco;
    })
    .join('\n      ');

  if (!total) {
    return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Sem casos">
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="#d8dee5" stroke-width="22"></circle></svg>`;
  }

  return `<svg viewBox="0 0 140 140" width="140" height="140" role="img"
      aria-label="Distribuição de veredictos">
      ${arcos}
      <text x="70" y="66" text-anchor="middle" class="rosca-num">${percentagem(contagens)}</text>
      <text x="70" y="84" text-anchor="middle" class="rosca-rot">passa</text>
    </svg>`;
}

function legenda(contagens) {
  return `<ul class="legenda">${VEREDICTOS.map(
    (v) => `<li><i style="background:${CORES[v]}"></i>${ROTULOS[v]}
      <strong>${contagens[v]}</strong></li>`,
  ).join('')}</ul>`;
}

function barra(contagens) {
  if (!contagens.total) return '<div class="barra vazia"></div>';
  const partes = VEREDICTOS.filter((v) => contagens[v] > 0)
    .map(
      (v) =>
        `<span style="width:${((contagens[v] / contagens.total) * 100).toFixed(1)}%;background:${CORES[v]}"
        title="${ROTULOS[v]}: ${contagens[v]}"></span>`,
    )
    .join('');
  return `<div class="barra">${partes}</div>`;
}

function percentagem(contagens) {
  if (!contagens.total) return '—';
  return `${Math.round((contagens.passa / contagens.total) * 100)}%`;
}

function custo(metricas) {
  const valor = metricas?.custoUsd ?? 0;
  return valor ? `$${valor.toFixed(2)}` : '—';
}

function nomeCurto(d) {
  const partes = String(d.documento).split('/');
  return (partes[partes.length - 1] || d.id).replace(/\.md$/, '');
}

function escapar(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function estadoSessao(sessao) {
  if (!sessao.estado) return '';
  const razao = sessao.razao ? ` (${escapar(sessao.razao)})` : '';
  return ` · ${escapar(sessao.estado)}${razao}`;
}

const SCRIPT_ABAS = `
  const abas = document.querySelectorAll('.item');
  const paginas = document.querySelectorAll('.pagina');
  function mostrar(alvo) {
    abas.forEach((a) => {
      const activo = a.dataset.alvo === alvo;
      a.classList.toggle('activo', activo);
      a.setAttribute('aria-selected', String(activo));
    });
    paginas.forEach((p) => p.classList.toggle('activa', p.id === 'p-' + alvo));
    document.querySelector('.painel').scrollTo({ top: 0 });
  }
  abas.forEach((a) => a.addEventListener('click', () => mostrar(a.dataset.alvo)));
  document.querySelectorAll('[data-ir]').forEach((l) =>
    l.addEventListener('click', (e) => { e.preventDefault(); mostrar(l.dataset.ir); }));
`;

function moldura({ titulo, cabecalho, corpo, script = '' }) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<header class="topo">${cabecalho}</header>
${corpo}
${script ? `<script>${script}</script>` : ''}
</body>
</html>
`;
}

const ESTILO = `
:root { --tinta:#1b242c; --suave:#5b6b7c; --linha:#e2e7ec; --fundo:#f6f8fa; --papel:#fff; }
* { box-sizing:border-box; }
body { margin:0; font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--tinta); background:var(--fundo); }
.topo { background:var(--papel); border-bottom:1px solid var(--linha); padding:20px 28px; }
.topo h1 { margin:0; font-size:22px; }
.sub { margin:4px 0 0; color:var(--suave); font-size:13px; }
.voltar { display:inline-block; margin-bottom:8px; color:#2c6fb5; text-decoration:none; font-size:13px; }
.voltar:hover { text-decoration:underline; }
h2 { font-size:17px; margin:0 0 12px; }
h3 { font-size:15px; margin:24px 0 10px; }
h4 { font-size:14px; margin:0 0 6px; }
.cartoes { display:flex; flex-wrap:wrap; gap:12px; margin:20px 0; }
.cartao { background:var(--papel); border:1px solid var(--linha); border-radius:8px;
  padding:12px 18px; min-width:110px; }
.cartao .rotulo { display:block; color:var(--suave); font-size:12px; text-transform:uppercase;
  letter-spacing:.04em; }
.cartao strong { font-size:24px; font-weight:600; }
.bloco { background:var(--papel); border:1px solid var(--linha); border-radius:8px;
  padding:18px; margin:0 0 20px; }
.bloco.aviso { border-left:4px solid #b7791f; }
.grafico { display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
.rosca-num { font:600 22px system-ui; fill:var(--tinta); }
.rosca-rot { font:11px system-ui; fill:var(--suave); }
.legenda { list-style:none; margin:0; padding:0; display:grid; gap:6px; }
.legenda li { display:flex; align-items:center; gap:8px; font-size:13px; }
.legenda i { width:12px; height:12px; border-radius:3px; display:inline-block; }
.legenda strong { margin-left:auto; padding-left:14px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--linha); vertical-align:top; }
th { color:var(--suave); font-weight:600; font-size:12px; text-transform:uppercase;
  letter-spacing:.04em; }
td.num, th.num { text-align:right; white-space:nowrap; }
.vazio { color:var(--suave); font-style:italic; }
.barra { display:flex; height:9px; border-radius:5px; overflow:hidden; background:#eef1f4;
  min-width:120px; }
.barra span { display:block; }
.colunas { display:flex; align-items:flex-start; gap:0; height:calc(100vh - 92px); }
.lista { width:280px; flex:0 0 280px; background:var(--papel); border-right:1px solid var(--linha);
  height:100%; overflow:auto; padding:10px 0; }
.item { display:block; width:100%; text-align:left; background:none; border:0; cursor:pointer;
  padding:10px 20px; font:inherit; color:var(--tinta); border-left:3px solid transparent; }
.item:hover { background:var(--fundo); }
.item.activo { background:var(--fundo); border-left-color:#2c6fb5; font-weight:600; }
.painel { flex:1; height:100%; overflow:auto; padding:24px 28px; }
.pagina { display:none; }
.pagina.activa { display:block; }
.caso { background:var(--papel); border:1px solid var(--linha); border-radius:8px;
  padding:14px 16px; margin:0 0 12px; border-left:4px solid var(--linha); }
.caso.passa { border-left-color:#2e7d5b; }
.caso.falha { border-left-color:#c0392b; }
.caso.bloqueado { border-left-color:#b7791f; }
.caso.nao_aplicavel { border-left-color:#5b6b7c; }
.caso header { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.caso .id { font-weight:600; }
.selo { color:#fff; font-size:11px; padding:2px 9px; border-radius:11px; letter-spacing:.02em; }
dl { margin:0; display:grid; grid-template-columns:88px 1fr; gap:4px 12px; }
dt { color:var(--suave); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
dd { margin:0; }
.capturas { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
.capturas img { max-width:260px; border:1px solid var(--linha); border-radius:6px; display:block; }
.achado { background:#fffdf7; border:1px solid #f0e3c4; border-radius:8px; padding:14px 16px;
  margin:0 0 12px; }
.etiqueta { display:inline-block; margin:0 0 6px; font-size:12px; color:var(--suave); }
ul { margin:0; padding-left:20px; }
a { color:#2c6fb5; }
`;
