let SCORES = [];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const sorted = [...SCORES].sort((a, b) => b.xp - a.xp);
    return res.status(200).json(sorted);
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, xp } = body;
      if (!name || typeof xp !== 'number') return res.status(400).json({ error: 'invalid' });

      const idx = SCORES.findIndex(u => u.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        SCORES[idx].xp = Math.max(SCORES[idx].xp, xp);
        SCORES[idx].updatedAt = new Date().toISOString();
      } else {
        SCORES.push({ name, xp, joinedAt: new Date().toISOString() });
      }
      return res.status(200).json({ ok: true, total: SCORES.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
