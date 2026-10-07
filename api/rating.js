import { pushList, getJSON, setJSON, findByToken, num, str } from '../lib/db.js';

function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}
function json(res, code, data) { return res.status(code).json(data); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const found = await findByToken(bearer(req));

    // GET: publik boleh lihat rata-rata
    if (req.method === 'GET') {
      const list = (await getJSON('ratings')) || [];
      const count = list.length;
      const avg = count ? Math.round((list.reduce((s, r) => s + r.stars, 0) / count) * 10) / 10 : 0;
      return json(res, 200, { ok: true, count, avg, list: list.slice(-50).reverse() });
    }

    if (req.method === 'POST') {
      if (!found) return json(res, 401, { error: 'Login dulu' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const stars = num(body.stars);
      const comment = str(body.comment, 300);
      if (stars < 1 || stars > 5) return json(res, 400, { error: 'Bintang 1–5' });

      // Cek kalau sudah pernah rating → update
      const list = (await getJSON('ratings')) || [];
      const idx = list.findIndex(r => r.username === found.user.username);
      const item = {
        username: found.user.username,
        classLevel: found.user.classLevel,
        stars, comment,
        at: new Date().toISOString()
      };
      if (idx >= 0) list[idx] = item; else list.push(item);
      await setJSON('ratings', list.slice(-500));

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('RATING ERROR:', e);
    return json(res, 500, { error: e.message });
  }
}
