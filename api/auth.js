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

async function hashPw(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rbjp:' + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

function slugNama(n) {
  return n.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.json({ 
      status: 'ok', 
      hasKV: !!(KV_URL && KV_TOKEN),
      kvUrl: KV_URL ? 'diset' : 'KOSONG',
      kvToken: KV_TOKEN ? 'diset' : 'KOSONG'
    });
  }

  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV_REST_API_URL / KV_REST_API_TOKEN belum diset' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { action, nama, password, avatar, stats } = body;

    if (!action) return res.status(400).json({ error: 'action wajib diisi' });

    if (action === 'register') {
      if (!nama || nama.trim().length < 3) return res.status(400).json({ error: 'Nama minimal 3 karakter' });
      if (!password || password.length < 4) return res.status(400).json({ error: 'Password minimal 4 karakter' });

      const slug = slugNama(nama);
      if (slug.length < 3) return res.status(400).json({ error: 'Nama hanya boleh huruf, angka, dan spasi' });

      const key = 'user:' + slug;
      const exists = await redis('EXISTS', key);
      if (exists === 1) return res.status(409).json({ error: 'Nama "' + nama + '" sudah dipakai. Coba nama lain.' });

      const user = {
        nama: nama.trim(),
        slug,
        hash: await hashPw(password),
        avatar: avatar || '🦊',
        xp: 0,
        coins: 20,
        streak: 0,
        soal: 0,
        benar: 0,
        menitFokus: 0,
        lastActive: new Date().toISOString().slice(0, 10),
        dibuat: Date.now()
      };

      await redis('SET', key, JSON.stringify(user));
      await redis('ZADD', 'leaderboard', '0', slug);
      await redis('SADD', 'users:all', slug);

      const safe = { ...user };
      delete safe.hash;
      return res.json({ ok: true, user: safe, message: 'Akun berhasil dibuat!' });
    }

    if (action === 'login') {
      if (!nama || !password) return res.status(400).json({ error: 'Nama dan password wajib diisi' });

      const slug = slugNama(nama);
      const key = 'user:' + slug;
      const raw = await redis('GET', key);
      if (!raw) return res.status(404).json({ error: 'Akun tidak ditemukan. Cek nama atau daftar dulu.' });

      const user = JSON.parse(raw);
      if (user.hash !== await hashPw(password)) {
        return res.status(401).json({ error: 'Password salah' });
      }

      // Update lastActive & streak
      const t = new Date().toISOString().slice(0, 10);
      const km = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (user.lastActive !== t) {
        if (user.lastActive === km) user.streak = (user.streak || 0) + 1;
        else if (user.lastActive) user.streak = 1;
        user.lastActive = t;
        await redis('SET', key, JSON.stringify(user));
      }

      const safe = { ...user };
      delete safe.hash;
      return res.json({ ok: true, user: safe });
    }

    if (action === 'update') {
      if (!nama || !password) return res.status(400).json({ error: 'Nama dan password wajib' });

      const slug = slugNama(nama);
      const key = 'user:' + slug;
      const raw = await redis('GET', key);
      if (!raw) return res.status(404).json({ error: 'Akun tidak ditemukan' });

      const user = JSON.parse(raw);
      if (user.hash !== await hashPw(password)) {
        return res.status(401).json({ error: 'Sesi tidak valid' });
      }

      const allowed = ['xp','coins','streak','soal','benar','menitFokus','avatar','lastActive'];
      if (stats && typeof stats === 'object') {
        allowed.forEach(k => {
          if (stats[k] !== undefined) user[k] = stats[k];
        });
      }

      await redis('SET', key, JSON.stringify(user));
      await redis('ZADD', 'leaderboard', String(user.xp || 0), slug);

      const safe = { ...user };
      delete safe.hash;
      return res.json({ ok: true, user: safe });
    }

    return res.status(400).json({ error: 'Action tidak dikenal: ' + action });

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Terjadi kesalahan server' });
  }
        }
