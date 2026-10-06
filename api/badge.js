import { getJSON, setJSON, findByToken, num } from './db.js';

function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}
function json(res, code, data) { return res.status(code).json(data); }

const ALL_BADGES = [
  { id: 'first_quiz', name: 'Langkah Pertama', icon: '🎯', desc: 'Selesaikan 1 kuis' },
  { id: 'quiz_10', name: 'Rajin', icon: '📚', desc: 'Selesaikan 10 kuis' },
  { id: 'quiz_50', name: 'Kutu Buku', icon: '📖', desc: 'Selesaikan 50 kuis' },
  { id: 'xp_1000', name: 'Bintang', icon: '⭐', desc: 'Kumpulkan 1.000 XP' },
  { id: 'xp_5000', name: 'Superstar', icon: '🌟', desc: 'Kumpulkan 5.000 XP' },
  { id: 'streak_7', name: 'Seminggu Penuh', icon: '🔥', desc: 'Streak 7 hari' },
  { id: 'streak_30', name: 'Sebulan Berturut', icon: '🔥', desc: 'Streak 30 hari' },
  { id: 'osn_master', name: 'Master OSN', icon: '🏅', desc: 'Lulus 5 kuis OSN' },
  { id: 'tryout_top', name: 'Top Tryout', icon: '🥇', desc: 'Masuk Top 10 Tryout' },
  { id: 'boss_slayer', name: 'Pembasmi Boss', icon: '⚔️', desc: 'Kalahkan Boss 5×' }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const found = await findByToken(bearer(req));
    if (!found) return json(res, 401, { error: 'Login dulu' });
    const key = 'badge_' + found.key;

    if (req.method === 'GET') {
      const owned = (await getJSON(key)) || {};
      const list = ALL_BADGES.map(b => ({
        ...b,
        owned: !!owned[b.id],
        at: owned[b.id] || null
      }));
      return json(res, 200, { ok: true, list, count: Object.keys(owned).length });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = String(body.id || '').trim();
      const valid = ALL_BADGES.find(b => b.id === id);
      if (!valid) return json(res, 400, { error: 'Badge tidak dikenal' });

      const owned = (await getJSON(key)) || {};
      if (owned[id]) return json(res, 200, { ok: true, already: true, list: owned });

      owned[id] = new Date().toISOString();
      await setJSON(key, owned);

      return json(res, 200, { ok: true, badge: valid });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('BADGE ERROR:', e);
    return json(res, 500, { error: e.message });
  }
        }
