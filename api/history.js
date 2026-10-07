import { pushList, listRange, findByToken, str, num } from '../lib/db.js';

function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}
function json(res, code, data) { return res.status(code).json(data); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const found = await findByToken(bearer(req));
    if (!found) return json(res, 401, { error: 'Login dulu' });
    const key = 'hist_' + found.key;

    if (req.method === 'GET') {
      const list = await listRange(key, 50, true);
      return json(res, 200, { ok: true, list });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const subject = str(body.subject, 40) || 'Umum';
      const mode = str(body.mode, 20) || 'normal';
      const score = num(body.score);
      const total = num(body.total);
      if (!total || score < 0 || score > total) return json(res, 400, { error: 'Skor tidak valid' });

      await pushList(key, {
        subject, mode,
        score, total,
        percent: Math.round((score / total) * 100),
        at: new Date().toISOString()
      }, 200);

      return json(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      await pushList(key, { cleared: true }, 0);
      const { setJSON } = await import('./db.js');
      await setJSON(key, []);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('HISTORY ERROR:', e);
    return json(res, 500, { error: e.message });
  }
  }
