import {
  getJSON, setJSON, getAllUsers, saveAllUsers,
  findByUsername, findByToken, str, num, ID_RE
} from '../lib/db.js';

/* ============ PASSWORD (Web Crypto, edge-friendly) ============ */
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + "::" + pw + "::rb");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function makeSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

function makeToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(res, code, data) { return res.status(code).json(data); }

function bearer(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function validPass(pw) {
  if (!pw || pw.length < 6) return "Password minimal 6 karakter";
  if (pw.length > 72) return "Password maksimal 72 karakter";
  return null;
}

/* ============ HANDLER ============ */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get("action");
  const body = req.method === "POST"
    ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
    : {};

  try {
    /* ============ REGISTER ============ */
    if (req.method === "POST" && action === "register") {
      const username = str(body.username, 20).toLowerCase();
      const display = str(body.username, 20);
      const password = String(body.password || "");
      const kelas = num(body.classLevel);

      if (!ID_RE.test(username)) return json(res, 400, { error: "Username 3–16 huruf/angka/underscore" });
      const ep = validPass(password); if (ep) return json(res, 400, { error: ep });
      if (kelas < 1 || kelas > 12) return json(res, 400, { error: "Kelas harus 1–12" });

      const users = await getAllUsers();
      if (users[username]) return json(res, 400, { error: "Username sudah dipakai" });

      const salt = makeSalt();
      const hash = await hashPw(password, salt);
      const token = makeToken();

      users[username] = {
        username: display,
        usernameLower: username,
        classLevel: kelas,
        salt, hash, token,
        xp: 0, streak: 0, best: { sprint: 0 },
        createdAt: new Date().toISOString()
      };
      await saveAllUsers(users);

      return json(res, 200, {
        ok: true, token,
        user: { username: display, classLevel: kelas, xp: 0, streak: 0 }
      });
    }

    /* ============ LOGIN ============ */
    if (req.method === "POST" && action === "login") {
      const username = str(body.username, 20).toLowerCase();
      const password = String(body.password || "");
      if (!username || !password) return json(res, 400, { error: "Username & password wajib" });

      const u = await findByUsername(username);
      if (!u) return json(res, 404, { error: "User tidak ditemukan" });

      const hash = await hashPw(password, u.salt);
      if (hash !== u.hash) return json(res, 401, { error: "Password salah" });

      const users = await getAllUsers();
      users[u.usernameLower].token = makeToken();
      await saveAllUsers(users);

      return json(res, 200, {
        ok: true, token: users[u.usernameLower].token,
        user: {
          username: u.username, classLevel: u.classLevel,
          xp: u.xp || 0, streak: u.streak || 0
        }
      });
    }

    /* ============ ME ============ */
    if (req.method === "GET" && action === "me") {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: "Token tidak valid" });
      const u = found.user;
      return json(res, 200, {
        ok: true,
        user: {
          username: u.username, classLevel: u.classLevel,
          xp: u.xp || 0, streak: u.streak || 0
        }
      });
    }

    /* ============ LOGOUT ============ */
    if (req.method === "POST" && action === "logout") {
      const found = await findByToken(bearer(req));
      if (found) {
        const users = await getAllUsers();
        users[found.key].token = null;
        await saveAllUsers(users);
      }
      return json(res, 200, { ok: true });
    }

    /* ============ GANTI PASSWORD ============ */
    if (req.method === "POST" && action === "change-password") {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: "Login dulu" });

      const oldPw = String(body.oldPassword || "");
      const newPw = String(body.newPassword || "");
      const ep = validPass(newPw); if (ep) return json(res, 400, { error: ep });

      const oldHash = await hashPw(oldPw, found.user.salt);
      if (oldHash !== found.user.hash) return json(res, 401, { error: "Password lama salah" });

      const users = await getAllUsers();
      users[found.key].salt = makeSalt();
      users[found.key].hash = await hashPw(newPw, users[found.key].salt);
      users[found.key].token = makeToken();
      await saveAllUsers(users);

      return json(res, 200, { ok: true, token: users[found.key].token });
    }

    /* ============ UPDATE PROFIL (kelas) ============ */
    if (req.method === "POST" && action === "update-profile") {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: "Login dulu" });

      const kelas = num(body.classLevel);
      if (kelas < 1 || kelas > 12) return json(res, 400, { error: "Kelas harus 1–12" });

      const users = await getAllUsers();
      users[found.key].classLevel = kelas;
      await saveAllUsers(users);

      return json(res, 200, { ok: true, user: { username: found.user.username, classLevel: kelas } });
    }

    return json(res, 404, { error: "Action tidak dikenal" });
  } catch (e) {
    console.error("AUTH ERROR:", e);
    return json(res, 500, { error: e.message || "Server error" });
  }
        }
