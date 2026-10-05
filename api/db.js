const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

const K = (c) => "rb:" + c;
const ID_RE = /^[a-z0-9_]{3,16}$/;
const str = (v, n) => String(v == null ? "" : v).slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function getAkun(id) {
  const raw = await redis(["HGET", K("akun"), id]);
  return raw ? JSON.parse(raw) : null;
}

async function authOk(u, h) {
  if (!ID_RE.test(str(u, 16)) || !h) return false;
  const a = await getAkun(u);
  return !!a && a.h === h;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "Database belum terhubung" });
  try {
    const b = req.body || {};
    const { op, col, id } = b;

    if (op === "get") {
      if (!["akun", "lb", "ratings"].includes(col)) return res.status(400).json({ error: "bad" });
      const raw = await redis(["HGET", K(col), str(id, 60)]);
      if (!raw) return res.json({ exists: false });
      const data = JSON.parse(raw);
      if (col === "akun" && data.h !== b.h) data.h = ""; // hash tidak pernah dibocorkan
      return res.json({ exists: true, data });
    }

    if (op === "list") {
      if (!["lb", "ratings"].includes(col)) return res.status(400).json({ error: "bad" });
      const arr = (await redis(["HGETALL", K(col)])) || [];
      const docs = [];
      for (let i = 0; i < arr.length; i += 2) {
        try { docs.push({ id: arr[i], data: JSON.parse(arr[i + 1]) }); } catch (e) {}
      }
      return res.json({ docs });
    }

    if (op === "set") {
      const d = b.data || {};
      if (col === "akun") {
        const key = str(id, 16);
        if (!ID_RE.test(key)) return res.status(400).json({ error: "Nama tidak valid" });
        const h = str(d.h, 70);
        if (h.length < 8) return res.status(400).json({ error: "bad" });
        const rec = JSON.stringify({ n: str(d.n, 16), h, t: num(d.t) || Date.now() });
        const old = await getAkun(key);
        if (!old) {
          const ok = await redis(["HSETNX", K("akun"), key, rec]);
          if (!ok) return res.status(409).json({ error: "Nama sudah dipakai" });
        } else {
          if (b.auth !== old.h) return res.status(403).json({ error: "Tidak diizinkan" });
          await redis(["HSET", K("akun"), key, JSON.stringify({ n: old.n, h, t: old.t })]);
        }
        return res.json({ ok: true });
      }

      if (!(await authOk(str(b.u, 16), b.h))) return res.status(403).json({ error: "Belum masuk" });

      if (col === "lb") {
        if (id !== b.u) return res.status(403).json({ error: "Tidak diizinkan" });
        const rec = { n: str(d.n, 16), p: num(d.p), pm: num(d.pm), mk: str(d.mk, 20) };
        await redis(["HSET", K("lb"), b.u, JSON.stringify(rec)]);
        return res.json({ ok: true });
      }
      if (col === "ratings") {
        if (id !== b.u) return res.status(403).json({ error: "Tidak diizinkan" });
        const r = Math.max(1, Math.min(5, Math.round(num(d.r))));
        await redis(["HSET", K("ratings"), b.u, JSON.stringify({ r })]);
        return res.json({ ok: true });
      }
      if (col === "saran") {
        const rec = { n: str(d.n, 16), t: str(d.t, 500), ts: Date.now() };
        await redis(["HSET", K("saran"), Date.now() + "-" + b.u, JSON.stringify(rec)]);
        return res.json({ ok: true });
      }
    }
    return res.status(400).json({ error: "bad" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
