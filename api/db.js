const URL_ = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

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
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 200);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ============ DASAR ============ */
export async function getRaw(key) {
  return redis(["GET", K(key)]);
}

export async function setRaw(key, val) {
  return redis(["SET", K(key), val]);
}

export async function delKey(key) {
  return redis(["DEL", K(key)]);
}

export async function getJSON(key) {
  const v = await getRaw(key);
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export async function setJSON(key, obj) {
  return setRaw(key, JSON.stringify(obj));
}

/* ============ LIST (riwayat, chat, dsb) ============ */
export async function pushList(key, item, maxLen) {
  const list = (await getJSON(key)) || [];
  list.push(item);
  const cut = list.slice(-(maxLen || 200));
  await setJSON(key, cut);
  return cut.length;
}

export async function listRange(key, count, reverse) {
  const list = (await getJSON(key)) || [];
  const sliced = reverse ? list.slice(-count).reverse() : list.slice(-count);
  return sliced;
}

/* ============ USER HELPERS ============ */
export async function getAllUsers() {
  return (await getJSON("users")) || {};
}

export async function saveAllUsers(users) {
  return setJSON("users", users);
}

export async function findByUsername(username) {
  const users = await getAllUsers();
  return users[str(username, 20).toLowerCase()] || null;
}

export async function findByToken(token) {
  if (!token) return null;
  const users = await getAllUsers();
  for (const k in users) {
    if (users[k].token === token) return { key: k, user: users[k] };
  }
  return null;
}

export { K, ID_RE, str, num };
