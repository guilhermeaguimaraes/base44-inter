const express = require('express');
const https = require('https');

const HOST = 'cdpj.partners.bancointer.com.br';
const PROXY_TOKEN = process.env.PROXY_TOKEN;
const CERT = process.env.INTER_CERT_PEM;
const KEY = process.env.INTER_KEY_PEM;

function normalizePem(raw) {
  if (!raw) return '';
  var s = String(raw).trim();
  var m = s.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/i);
  if (!m) return s;
  var b64 = m[2].replace(/\s+/g, '');
  var lines = b64.match(/.{1,64}/g) || [];
  return '-----BEGIN ' + m[1] + '-----\n' + lines.join('\n') + '\n-----END ' + m[1] + '-----\n';
}

const app = express();
app.use(express.raw({ type: function () { return true; }, limit: '2mb' }));

app.all('/*', (req, res) => {
  if (req.headers['x-proxy-token'] !== PROXY_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const path = req.originalUrl;
  const fwd = {};
  for (const h of ['authorization', 'content-type', 'accept']) if (req.headers[h]) fwd[h] = req.headers[h];
  const cert = normalizePem(CERT), key = normalizePem(KEY);
  if (!cert || !key) return res.status(500).json({ error: 'Certificado ou chave nao configurados' });

  const proxyReq = https.request({
    hostname: HOST, port: 443, path: path, method: req.method,
    headers: Object.assign({}, fwd, { Host: HOST }),
    cert: cert, key: key, servername: HOST, rejectUnauthorized: true
  }, (proxyRes) => {
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => res.status(502).json({ error: e.message }));
  if (req.body && req.body.length) proxyReq.write(req.body);
  proxyReq.end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Inter proxy on ' + port));
