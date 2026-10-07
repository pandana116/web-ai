import { getJSON, setJSON, findByToken, str } from '../lib/db.js';

function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function json(res, code, data) {
  return res.status(code).json(data);
}

export default async function handler(req, res) {
  // Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = (url.searchParams.get('room') || 'umum').replace(/[^a-z0-9_-]/gi, '');
  const key = 'chat_' + room;
  const apiKey = process.env.GROQ_API_KEY;

  try {
    // ================= GET (Ambil Pesan) =================
    if (req.method === 'GET') {
      const since = url.searchParams.get('since');
      const markRead = url.searchParams.get('markRead') === '1';
      const msgs = (await getJSON(key)) || [];

      const found = await findByToken(bearer(req));
      if (markRead && found) {
        await setJSON('chatread_' + found.key + '_' + room, Date.now());
      }

      if (since) {
        const t = Number(since);
        return res.status(200).json({
          ok: true,
          list: msgs.filter(m => new Date(m.at).getTime() > t),
          serverTime: Date.now()
        });
      }
      return res.status(200).json(msgs.slice(-100));
    }

    // ================= POST (Kirim Pesan & Balas AI) =================
    if (req.method === 'POST') {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: 'Login dulu' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      if (body.action === 'unread-count') {
        const lastSeen = (await getJSON('chatread_' + found.key + '_' + room)) || 0;
        const msgs = (await getJSON(key)) || [];
        const unread = msgs.filter(m => new Date(m.at).getTime() > lastSeen && m.user !== found.user.username).length;
        return res.status(200).json({ ok: true, unread });
      }

      const text = str(body.text, 500);
      if (!text) return json(res, 400, { error: 'Pesan kosong' });

      const msgs = (await getJSON(key)) || [];
      
      // 1. Simpan pesan dari User
      const userMsg = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        user: found.user.username,
        classLevel: found.user.classLevel,
        text,
        at: new Date().toISOString()
      };
      msgs.push(userMsg);

      // 2. Logika AI (Jika ada panggilan @ai di dalam chat)
      if (apiKey && text.toLowerCase().includes('@ai')) {
        try {
          const prompt = text.replace(/@ai/gi, '').trim(); // Hapus mention @ai
          
          const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant', // <--- MODEL BARU YANG VALID
              messages: [
                { role: 'system', content: 'Anda adalah asisten AI yang ramah dan membantu.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7
            })
          });

          const aiData = await aiResponse.json();
          
          if (aiResponse.ok && aiData.choices?.[0]?.message?.content) {
            // Simpan balasan AI ke chat
            const aiMsg = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
              user: 'AI Assistant',
              classLevel: 'Sistem',
              text: aiData.choices[0].message.content,
              at: new Date().toISOString()
            };
            msgs.push(aiMsg);
          }
        } catch (aiErr) {
          console.error('AI Error:', aiErr);
          // Jangan gagalkan pengiriman pesan user jika AI error
        }
      }

      await setJSON(key, msgs.slice(-200)); // Simpan maksimal 200 pesan terakhir
      return res.status(200).json({ ok: true });
    }

    // ================= DELETE (Hapus Pesan) =================
    if (req.method === 'DELETE') {
      const found = await findByToken(bearer(req));
      if (!found) return json(res, 401, { error: 'Login dulu' });
      
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = str(body.id, 50);
      
      const msgs = (await getJSON(key)) || [];
      const filtered = msgs.filter(m => !(m.id === id && m.user === found.user.username));
      
      await setJSON(key, filtered);
      return res.status(200).json({ ok: true });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('CHAT ERROR:', e);
    return json(res, 500, { error: e.message });
  }
        }
