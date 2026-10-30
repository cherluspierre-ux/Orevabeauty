#!/usr/bin/env node
/* ==========================================================
   OREVA - serveur (aucune dependance, Node 16+)
   Lancer :  node server.js   puis ouvrir http://localhost:3000

   Role :
   - sert le site (dossier /public)
   - comptes clients (mots de passe haches avec scrypt, sessions par cookie HttpOnly)
   - commandes, suivi, affiliation, retraits, avis (photos / videos)
   - offre -15 % pour les 50 PREMIERS clients comptee ici (impossible a contourner)
   - tout est enregistre dans data/ (db.json + uploads/)

   Administration : http://localhost:3000/admin.html
   La cle admin est definie par la variable ADMIN_KEY. Si elle n'est pas
   definie, une cle temporaire est affichee dans cette console au demarrage.
   ========================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ADMIN_KEY = process.env.ADMIN_KEY || crypto.randomBytes(9).toString('hex');
const ADMIN_KEY_IS_TEMP = !process.env.ADMIN_KEY;
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

/* ---------- config partagee avec le site ---------- */
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(PUBLIC_DIR, 'config.js'), 'utf8'), sandbox);
const { CONFIG, compute } = sandbox.OREVA;

/* ---------- outils crypto (mots de passe : scrypt) ---------- */
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
const nodeCrypto = {
  async randomToken() { return crypto.randomBytes(32).toString('hex'); },
  async randomId() { return crypto.randomBytes(8).toString('hex'); },
  async sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); },
  async hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    return 'scrypt$' + salt.toString('hex') + '$' + (await scrypt(pw, salt)).toString('hex');
  },
  async verifyPassword(pw, stored) {
    const [kind, saltHex, hashHex] = String(stored).split('$');
    if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
    const got = await scrypt(pw, Buffer.from(saltHex, 'hex'));
    const want = Buffer.from(hashHex, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }
};

/* ---------- fichiers televerses (photos de profil, photos / videos d'avis) ---------- */
const EXT = { jpg: 'image', png: 'image', webp: 'image', mp4: 'video', webm: 'video', mov: 'video' };
const MEDIA_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
const UPLOAD_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm|mov)$/;

/* identifie le vrai type d'un fichier d'apres son contenu (on ne fait pas confiance au nom ni a l'en-tete) */
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp') return buf.toString('latin1', 8, 10) === 'qt' ? 'mov' : 'mp4';
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'webm';
  return null;
}
function storeFile(buf, ext) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

const media = {
  videoSupported: true,
  async saveAvatar(dataUrl) {
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('bad_image');
    const buf = Buffer.from(m[1], 'base64');
    const ext = sniff(buf);
    if (!ext || EXT[ext] !== 'image' || buf.length > 400 * 1024) throw new Error('bad_image');
    return 'uploads/' + storeFile(buf, ext);
  },
  /* une piece jointe doit etre un fichier televerse PAR CET utilisateur */
  checkAttachment(db, userId, item) {
    if (!item || typeof item.url !== 'string') return null;
    const m = /^uploads\/([a-f0-9]{32}\.(?:jpg|png|webp|mp4|webm|mov))$/.exec(item.url);
    if (!m) return null;
    const rec = db.uploads[m[1]];
    if (!rec || rec.userId !== userId) return null;
    return { type: rec.type, url: item.url };
  }
};

const core = require('./public/core.js').create({
  CONFIG, compute, crypto: nodeCrypto, media
  /* >>> ICI : brancher Stripe / PayPal avec  processPayment: async (order, payment) => ({ paymentStatus: 'paid' })
     (et passer CONFIG.payment.mode a 'live' dans public/config.js) */
});

/* ---------- base de donnees (fichier JSON, ecriture atomique) ---------- */
function loadDb() {
  let db;
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = core.emptyDb(); }
  return core.fix(db);
}
let db = loadDb();
function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/* Un seul traitement a la fois : le compteur des 50 rabais ne peut jamais etre depasse */
let queue = Promise.resolve();
function locked(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/* ---------- utilitaires HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
};

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body)
  }, SECURITY_HEADERS, extraHeaders || {}));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject({ status: 413, error: 'too_large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject({ status: 400, error: 'read_error' }));
  });
}

const RATE_LIMIT = Number(process.env.RATE_LIMIT) || 90;      // requetes d'ecriture / minute / IP
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { count: 1, reset: now + 60000 }); return false; }
  h.count++;
  return h.count > RATE_LIMIT;
}
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (n > v.reset) hits.delete(k); }, 60000).unref();

function clientIp(req) { return req.socket.remoteAddress || 'x'; }
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAdmin(req) {
  const given = String(req.headers['x-admin-key'] || '');
  const a = Buffer.from(given), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookieHeader(session, req) {
  const secure = COOKIE_SECURE || req.headers['x-forwarded-proto'] === 'https';
  const base = 'oreva_sid=' + (session.clear ? '' : session.set) + '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  return base + (session.clear ? '; Max-Age=0' : '; Max-Age=' + session.maxAge);
}
/* protection contre les requetes venues d'un autre site : en-tete personnalise obligatoire + meme origine */
function sameOriginOk(req) {
  if (req.headers['x-requested-with'] !== 'oreva') return false;
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return false; } catch (e) { return false; } }
  return true;
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const ip = clientIp(req);
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  if (write) {
    if (!sameOriginOk(req)) return sendJson(res, 403, { error: 'forbidden' });
    if (rateLimited(ip)) return sendJson(res, 429, { error: 'rate_limited' });
  }
  const sid = parseCookies(req).oreva_sid || null;

  /* televersement brut (photo / video d'avis) : POST /api/upload */
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > 30 * 1024 * 1024) return sendJson(res, 413, { error: 'too_large' });
    let buf;
    try { buf = await readBody(req, 30 * 1024 * 1024); } catch (e) { return sendJson(res, e.status || 400, { error: e.error || 'bad_request' }); }
    return locked(async () => {
      const me = await core.handle(db, { method: 'GET', path: '/auth/me', sid, ip });
      if (!me.body.user) return sendJson(res, 401, { error: 'auth_required' });
      const ext = sniff(buf);
      if (!ext) return sendJson(res, 415, { error: 'unsupported_type' });
      const type = EXT[ext];
      if (type === 'image' && buf.length > 8 * 1024 * 1024) return sendJson(res, 413, { error: 'too_large' });
      const name = storeFile(buf, ext);
      db.uploads[name] = { userId: me.body.user.id, type, at: new Date().toISOString() };
      saveDb();
      return sendJson(res, 201, { url: 'uploads/' + name, type });
    });
  }

  let body = {};
  if (write) {
    try {
      const raw = await readBody(req, 700 * 1024);
      body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
    } catch (e) { return sendJson(res, e.status || 400, { error: e.error || 'invalid_json' }); }
  }
  const query = {}; url.searchParams.forEach((v, k) => { query[k] = v; });
  const apiPath = url.pathname.slice(4).replace(/\/+$/, '') || '/';
  const admin = apiPath.startsWith('/admin/') && isAdmin(req);

  return locked(async () => {
    const out = await core.handle(db, { method: req.method === 'HEAD' ? 'GET' : req.method, path: apiPath, query, body, sid, admin, ip });
    if (out.dirty) saveDb();
    const headers = out.session ? { 'Set-Cookie': cookieHeader(out.session, req) } : undefined;
    sendJson(res, out.status, out.body, headers);
  });
}

/* ---------- fichiers statiques ---------- */
function serveFile(req, res, file, type, cache, extra) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, SECURITY_HEADERS));
      return res.end('Page introuvable');
    }
    const headers = Object.assign({ 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes' }, SECURITY_HEADERS, extra || {});
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {                         // lecture partielle (necessaire pour les videos)
      let start = range[1] ? parseInt(range[1], 10) : Math.max(0, st.size - parseInt(range[2], 10));
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, Object.assign(headers, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 }));
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }

  if (rel.startsWith('/uploads/')) {                              // fichiers televerses (liste blanche stricte)
    const name = rel.slice(9);
    if (!UPLOAD_NAME_RE.test(name)) { res.writeHead(404, SECURITY_HEADERS); return res.end(); }
    return serveFile(req, res, path.join(UPLOAD_DIR, name), MEDIA_TYPES[name.split('.')[1]], 'public, max-age=604800, immutable');
  }

  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) { res.writeHead(403); return res.end('Forbidden'); }
  const ext = path.extname(file).toLowerCase();
  const cache = (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-cache' : 'public, max-age=86400';
  serveFile(req, res, file, MIME[ext] || 'application/octet-stream', cache);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, () => {
  const st = core.offerState(db);
  console.log('Oreva en ligne : http://localhost:' + PORT);
  console.log('Offre -' + st.percent + ' % : ' + st.used + '/' + st.limit + ' utilisees, ' + st.remaining + ' restantes');
  console.log('Administration : http://localhost:' + PORT + '/admin.html');
  console.log('Cle admin' + (ADMIN_KEY_IS_TEMP ? ' (TEMPORAIRE, changee a chaque demarrage : definissez ADMIN_KEY pour la garder)' : '') + ' : ' + ADMIN_KEY);
  if (CONFIG.payment.mode === 'demo') console.log('Paiement : MODE TEST (aucun argent reel). Les retraits et paiements sont fictifs.');
});
