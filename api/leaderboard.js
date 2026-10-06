import { getAllUsers, findByToken, num } from './db.js';

function bearer(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const kelasQ = url.searchParams.get("class");
    const scope = url.searchParams.get("scope") || "global"; // global | class
    const limit = Math.min(num(url.searchParams.get("limit")) || 50, 100);

    const users = await getAllUsers();
    let list = Object.values(users)
      .filter(u => u && u.username)
      .map(u => ({
        username: u.username,
        classLevel: u.classLevel,
        xp: u.xp || 0,
        streak: u.streak || 0,
        lastPlay: u.lastPlay || null
      }));

    if (scope === "class") {
      const kelas = num(kelasQ);
      if (kelas < 1 || kelas > 12) return res.status(400).json({ error: "Kelas harus 1–12" });
      list = list.filter(u => u.classLevel === kelas);
    }

    list.sort((a, b) => b.xp - a.xp);
    list = list.slice(0, limit);
    list.forEach((u, i) => { u.rank = i + 1; });

    // Rank user sendiri (kalau login)
    let me = null;
    const found = await findByToken(bearer(req));
    if (found) {
      const myRank = list.findIndex(u => u.username === found.user.username);
      me = {
        username: found.user.username,
        classLevel: found.user.classLevel,
        xp: found.user.xp || 0,
        rank: myRank >= 0 ? myRank + 1 : null
      };
    }

    return res.status(200).json({
      ok: true,
      scope,
      classLevel: scope === "class" ? num(kelasQ) : null,
      total: list.length,
      list,
      me
    });
  } catch (e) {
    console.error("LEADERBOARD ERROR:", e);
    return res.status(500).json({ error: e.message });
  }
}
