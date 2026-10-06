const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function redis(...args) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + KV_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV belum diset' });
  }

  try {
    // Ambil semua member dari sorted set, urut dari XP tertinggi
    // Format: [member1, score1, member2, score2, ...]
    const raw = await redis('ZREVRANGE', 'leaderboard', '0', '49', 'WITHSCORES');

    const rows = [];
    if (raw && raw.length) {
      // Ambil detail tiap user secara paralel
      const slugs = [];
      for (let i = 0; i < raw.length; i += 2) {
        slugs.push({ slug: raw[i], xp: parseInt(raw[i+1], 10) || 0 });
      }

      const details = await Promise.all(slugs.map(async (s) => {
        const key = 'user:' + s.slug;
        const userRaw = await redis('GET', key);
        if (!userRaw) return null;
        try {
          const u = JSON.parse(userRaw);
          return {
            nama: u.nama || s.slug,
            slug: s.slug,
            avatar: u.avatar || '🦊',
            xp: u.xp || 0,
            level: Math.floor((u.xp || 0) / 100) + 1,
            soal: u.soal || 0,
            streak: u.streak || 0
          };
        } catch { return null; }
      }));

      details.forEach(d => { if (d) rows.push(d); });
    }

    return res.json({ ok: true, rows, total: rows.length });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
    }
