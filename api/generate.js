// api/generate.js (Vercel Serverless Function)
// Membuat soal pilihan ganda lewat Groq API

module.exports = async function handler(req, res) {
  // Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY tidak ditemukan di Vercel' });

  try {
    // Sesuaikan nama variabel ini dengan yang dikirim oleh frontend Anda
    const { topic, level, count } = req.body; 
    
    const prompt = `Buatkan ${count || 5} soal pilihan ganda tentang "${topic || 'Umum'}" untuk jenjang "${level || 'SMP'}". 
    Kembalikan HANYA dalam format JSON array dengan struktur: 
    [{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "..."}]
    Jangan tambahkan teks lain di luar JSON.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // <--- MODEL TERBARU YANG VALID',
        messages: [
          { role: 'system', content: 'Anda adalah asisten AI pembuat soal yang selalu merespon dengan format JSON valid.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Error dari Groq API');
    }

    return res.status(200).json({ ok: true, result: data.choices[0].message.content });

  } catch (error) {
    console.error('Error Generate:', error);
    return res.status(500).json({ error: error.message });
  }
};
