// api/generate.js  (Vercel Serverless Function)
// Membuat soal pilihan ganda lewat Groq. API key disimpan di server (env var), bukan di HP.
//
// Wajib: set GROQ_API_KEY di Vercel -> Settings -> Environment Variables, lalu Redeploy.
// Jika project kamu memakai "type": "module" di package.json, ganti baris
//   module.exports = async function handler(req, res) {
// menjadi
//   export default async function handler(req, res) {

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Pemeriksaan login sederhana (hanya cek header ada).
  // Kalau kamu punya helper verifikasi token di api/auth.js, panggil di sini supaya lebih aman.
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || auth.length < 20) {
    return res.status(401).json({ error: 'Login dulu' });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'GROQ_API_KEY belum diatur di Vercel' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const mapel = String(body.mapel || 'Matematika').slice(0, 40);
  const jumlah = Math.min(Math.max(parseInt(body.jumlah, 10) || 5, 1), 10);
  const kelas = Math.min(Math.max(parseInt(body.kelas, 10) || 6, 1), 12);

  const prompt =
    `Buat ${jumlah} soal pilihan ganda mata pelajaran ${mapel} untuk siswa kelas ${kelas} di Indonesia, ` +
    `sesuai kurikulum yang berlaku. Soal harus benar, jelas, dan jawabannya hanya satu. ` +
    `Balas HANYA JSON dengan format: ` +
    `{"soal":[{"q":"pertanyaan","o":["pilihan A","pilihan B","pilihan C","pilihan D"],"a":0,"e":"pembahasan singkat"}]} ` +
    `dengan "a" adalah indeks jawaban benar (0 sampai 3).`;

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 2500,
        response_format: { type: 'json_object' }
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'Groq error ' + r.status + ': ' + t.slice(0, 120) });
    }

    const data = await r.json();
    const content = data.choices && data.choices[0] && data.choices[0].message.content;
    const parsed = JSON.parse(content);
    const soal = (parsed.soal || [])
      .filter(q => q && typeof q.q === 'string' && Array.isArray(q.o) && q.o.length >= 4 && Number.isInteger(q.a) && q.a >= 0 && q.a <= 3)
      .map(q => ({ s: mapel, k: 'AI', q: q.q, o: q.o.slice(0, 4).map(String), a: q.a, e: q.e || '' }));

    if (!soal.length) return res.status(502).json({ error: 'AI tidak menghasilkan soal yang valid, coba lagi' });
    return res.status(200).json({ soal });
  } catch (e) {
    return res.status(500).json({ error: 'Gagal membuat soal: ' + e.message });
  }
};
