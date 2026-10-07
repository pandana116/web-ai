import { getJSON, setJSON, findByToken, pushList, listRange, num, str } from '../lib/db.js';

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
    const key = 'notif_' + found.key;

    if (req.method === 'GET') {
      const list = await listRange(key, 30, true);
      const unread = list.filter(n => !n.read).length;
      return json(res, 200, { ok: true, list, unread });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const action = str(body.action, 20);

      // Tandai semua sudah dibaca
      if (action === 'read-all') {
        const list = (await getJSON(key)) || [];
        list.forEach(n => { n.read = true });
        await setJSON(key, list);
        return json(res, 200, { ok: true });
      }

      // Tandai satu sudah dibaca
      if (action === 'read') {
        const idx = num(body.index);
        const list = (await getJSON(key)) || [];
        if (list[idx]) { list[idx].read = true; await setJSON(key, list) }
        return json(res, 200, { ok: true });
      }

      // Kirim notifikasi ke user lain (broadcast ke kelas tertentu)
      if (action === 'broadcast') {
        const text = str(body.text, 200);
        const kelasTarget = num(body.classLevel);
        if (!text) return json(res, 400, { error: 'Teks kosong' });
        if (kelasTarget < 1 || kelasTarget > 12) return json(res, 400, { error: 'Kelas 1–12' });

        await pushList('notif_broadcast_k' + kelasTarget, {
          from: found.user.username,
          text,
          at: new Date().toISOString()
        }, 100);

        return json(res, 200, { ok: true });
      }

      // Baca broadcast kelas sendiri
      if (action === 'inbox-class') {
        const list = await listRange('notif_broadcast_k' + found.user.classLevel, 30, true);
        return json(res, 200, { ok: true, list });
      }

      return json(res, 400, { error: 'Action tidak dikenal' });
    }

    if (req.method === 'DELETE') {
      await setJSON(key, []);
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('NOTIF ERROR:', e);
    return json(res, 500, { error: e.message });
  }
      }
