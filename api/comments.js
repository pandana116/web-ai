import { pushList, listRange, findByToken, str } from '../lib/db.js';

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
    if (req.method === 'GET') {
      const list = await listRange('comments', 50, true);
      return json(res, 200, { ok: true, list });
    }

    if (req.method === 'POST') {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: 'Login dulu' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const text = str(body.text, 500);
      if (text.length < 3) return json(res, 400, { error: 'Komentar terlalu pendek' });

      await pushList('comments', {
        username: found.user.username,
        classLevel: found.user.classLevel,
        text,
        at: new Date().toISOString()
      }, 500);

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('COMMENTS ERROR:', e);
    return json(res, 500, { error: e.message });
  }
}
