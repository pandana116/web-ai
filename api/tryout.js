import { pushList, listRange, findByToken, num, str } from '../lib/db.js';

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
    if (!found) return json(res, 401, { error: 'Login dulu' });

    if (req.method === 'GET') {
      // Riwayat tryout user (20 terakhir)
      const list = await listRange('tryout_' + found.key, 20, true);
      // Ranking tryout terbaik semua user
      const all = await listRange('tryouts_all', 500, false);
      const best = {};
      all.forEach(t => {
        if (!best[t.username] || t.percent > best[t.username].percent) best[t.username] = t;
      });
      const top = Object.values(best)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 20);
      return json(res, 200, { ok: true, mine: list, top });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const score = num(body.score);
      const total = num(body.total);
      const durationSec = num(body.durationSec);
      const subject = str(body.subject, 40) || 'Campuran';

      if (!total || score < 0 || score > total) return json(res, 400, { error: 'Skor tidak valid' });
      if (durationSec < 0 || durationSec > 7200) return json(res, 400, { error: 'Durasi tidak valid' });

      const item = {
        username: found.user.username,
        classLevel: found.user.classLevel,
        subject, score, total, durationSec,
        percent: Math.round((score / total) * 100),
        at: new Date().toISOString()
      };

      await pushList('tryout_' + found.key, item, 50);
      await pushList('tryouts_all', item, 1000);

      return json(res, 200, { ok: true, item });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('TRYOUT ERROR:', e);
    return json(res, 500, { error: e.message });
  }
}
