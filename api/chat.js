export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const k = process.env.GROQ_API_KEY;
    return res.json({
      status: 'ok',
      hasKey: !!k,
      keyPrefix: k ? k.slice(0, 10) : 'KOSONG'
    });
  }

  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'GROQ_API_KEY kosong di Vercel' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = body.messages || [{ role: 'user', content: body.prompt || 'Halo' }];

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    const d = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({
        error: (d && d.error && d.error.message) || 'Groq error',
        status: r.status
      });
    }
    return res.json(d);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
}
