// Serve o build de producao do ccmsns-ui e encaminha /ccmsns para o core-api.
//
// Existe porque o `vite preview` nao tem proxy para a API, e porque a suite deve testar o
// build que a aplicacao realmente publica, nao o servidor de desenvolvimento.
//
// Configuracao por ambiente:
//   DIST   pasta do build (obrigatoria)
//   PORTA  porta de escuta (por omissao 4174)
//   API    host:porta do core-api (por omissao localhost:8080)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.DIST;
const PORTA = Number(process.env.PORTA ?? 4174);
const [API_HOST, API_PORTA] = (process.env.API ?? 'localhost:8080').split(':');

if (!DIST || !fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`DIST nao aponta para um build valido: ${DIST}`);
  process.exit(2);
}

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  if (req.url.startsWith('/ccmsns')) {
    const proxy = http.request(
      { host: API_HOST, port: Number(API_PORTA), path: req.url, method: req.method, headers: req.headers },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
    );
    proxy.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    req.pipe(proxy);
    return;
  }
  const limpo = req.url.split('?')[0];
  let ficheiro = path.join(DIST, limpo);
  if (!fs.existsSync(ficheiro) || fs.statSync(ficheiro).isDirectory()) ficheiro = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(ficheiro)] || 'application/octet-stream' });
  fs.createReadStream(ficheiro).pipe(res);
}).listen(PORTA, () => console.log(`preview+proxy em http://localhost:${PORTA} (dist: ${DIST}, api: ${API_HOST}:${API_PORTA})`));
