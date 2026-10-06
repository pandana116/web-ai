/**
 * ============================================================
 *  RAJIN BELAJAR JADI PINTAR — AI CHAT HANDLER
 *  File: api/chat.js
 *  Author: Pandana
 *  Version: 3.0 Pro
 * ============================================================
 *  Fitur:
 *  - Multi-provider fallback (Groq → Gemini → OpenAI)
 *  - Auto-detect provider dari env yang tersedia
 *  - Pemilihan model otomatis sesuai jenis pertanyaan
 *  - Sistem prompt adaptif (guru SD/SMP/SMA/umum)
 *  - Deteksi mata pelajaran otomatis
 *  - Mode jawaban: jelaskan, contoh, ringkas, latihan, terjemah
 *  - Conversation memory & context window
 *  - Rate limiting per IP (anti-spam)
 *  - Response cache (hemat kuota)
 *  - Sanitasi & safety filter
 *  - Robust error handling dengan retry
 *  - Logging sederhana
 *  - Health check endpoint
 *  - CORS support
 *  - Streaming ready (kalau mau dipakai nanti)
 * ============================================================
 */

// ============ KONFIGURASI GLOBAL ============
const CONFIG = {
  // Provider URLs (OpenAI-compatible)
  providers: {
    groq: {
      name: 'Groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      envKey: 'GROQ_API_KEY',
      defaultModel: 'llama-3.3-70b-versatile',
      fastModel: 'llama-3.1-8b-instant',
      reasonModel: 'deepseek-r1-distill-llama-70b',
      priority: 1
    },
    gemini: {
      name: 'Google Gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      envKey: 'GEMINI_API_KEY',
      defaultModel: 'gemini-2.0-flash',
      fastModel: 'gemini-2.0-flash',
      reasonModel: 'gemini-2.0-flash',
      priority: 2
    },
    openai: {
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/chat/completions',
      envKey: 'OPENAI_API_KEY',
      defaultModel: 'gpt-4o-mini',
      fastModel: 'gpt-4o-mini',
      reasonModel: 'gpt-4o-mini',
      priority: 3
    },
    deepseek: {
      name: 'DeepSeek',
      url: 'https://api.deepseek.com/v1/chat/completions',
      envKey: 'DEEPSEEK_API_KEY',
      defaultModel: 'deepseek-chat',
      fastModel: 'deepseek-chat',
      reasonModel: 'deepseek-reasoner',
      priority: 4
    }
  },

  // Batas ukuran
  maxTokens: 1500,
  temperature: 0.7,
  topP: 0.9,
  historyLimit: 12,      // pesan yang dikirim ke AI
  requestTimeout: 25000, // 25 detik
  maxRetries: 2,

  // Rate limit
  rateLimit: {
    windowMs: 60 * 1000, // 1 menit
    maxRequests: 15      // 15 request per menit per IP
  },

  // Cache
  cache: {
    enabled: true,
    ttlMs: 5 * 60 * 1000, // 5 menit
    maxSize: 200
  }
};

// ============ IN-MEMORY STORE (per instance) ============
const rateLimitStore = new Map();
const cacheStore = new Map();
const stats = {
  totalRequests: 0,
  totalErrors: 0,
  totalTokensUsed: 0,
  startTime: Date.now(),
  providerUsage: {}
};

// ============ SYSTEM PROMPTS ============
const SYSTEM_PROMPTS = {
  default: `Kamu adalah "Tutor AI" dari aplikasi belajar "Rajin Belajar Jadi Pintar" karya Pandana.

KEPRIBADIAN:
- Ramah, hangat, seperti kakak yang sabar mengajar adik.
- Selalu semangat dan menyemangati pelajar.
- Sabar menghadapi pertanyaan yang diulang.
- Tidak pernah menghina atau merendahkan.

GAYA MENJAWAB:
- Bahasa Indonesia yang baik, sesuai untuk pelajar.
- Sesuaikan tingkat kesulitan dengan jenjang (SD/SMP/SMA).
- Kalau soal hitungan, tunjukkan langkah-langkahnya.
- Kalau konsep, jelaskan dengan analogi sehari-hari.
- Maksimal 6 kalimat untuk jawaban singkat, atau lebih kalau memang perlu dijelaskan detail.
- JANGAN pakai markdown (bintang, pagar, garis bawah). Pakai teks biasa.
- Boleh pakai emoji secukupnya biar tidak kaku.
- Kalau tidak tahu, katakan jujur dan tawarkan bantuan lain.

FOKUS:
- Bantu pelajar memahami, bukan cuma memberi jawaban.
- Dorong pelajar untuk berpikir sendiri.
- Kalau ditanya soal ujian, bantu pahami konsepnya.`,

  sd: `Kamu adalah "Tutor AI" untuk pelajar SD (usia 6-12 tahun).

GAYA:
- Bahasa sangat sederhana, seperti bercerita.
- Pakai analogi mainan, hewan, makanan, atau kegiatan sehari-hari.
- Hindari istilah teknis. Kalau perlu, jelaskan dulu artinya.
- Banyak pakai emoji biar menyenangkan.
- Jawaban pendek-pendek, 3-4 kalimat saja.
- Selalu semangat dan memotivasi.

JANGAN:
- Jangan pakai markdown.
- Jangan bahas topik yang tidak cocok untuk anak-anak.`,

  smp: `Kamu adalah "Tutor AI" untuk pelajar SMP (usia 12-15 tahun).

GAYA:
- Bahasa yang jelas dan santai, tapi tidak kekanak-kanakan.
- Boleh pakai istilah teknis sederhana, jelaskan singkat.
- Pakai contoh nyata yang relate (game, media sosial, olahraga).
- Kalau soal hitungan, tunjukkan cara lengkap.
- Maksimal 6-8 kalimat.

JANGAN:
- Jangan pakai markdown.
- Jangan menggurui atau merendahkan.`,

  sma: `Kamu adalah "Tutor AI" untuk pelajar SMA/SMK (usia 15-18 tahun).

GAYA:
- Bahasa yang lebih formal tapi tetap hangat.
- Boleh pakai istilah teknis, tidak perlu dijelaskan panjang.
- Fokus pada pemahaman konsep dan persiapan ujian.
- Kalau soal hitungan, tunjukkan cara lengkap dan alternatif.
- Boleh sampai 10 kalimat kalau memang perlu.

JANGAN:
- Jangan pakai markdown.
- Jangan terlalu banyak basa-basi.`,

  guru: `Kamu adalah "Tutor AI" mode guru. Jawab dengan pendekatan pedagogis, sertakan tips mengajar, dan saran aktivitas kelas.`
};

// ============ DETEKSI MAPEL ============
const SUBJECT_PATTERNS = {
  matematika: /\b(hitung|jumlah|kali|bagi|kurang|tambah|persamaan|aljabar|geometri|segitiga|lingkaran|pecahan|desimal|persen|rata-rata|mean|median|modus|akar|pangkat|gradien|fungsi|integral|turunan|trigonometri|sin|cos|tan|logaritma|matriks|vektor|peluang|statistik)\b/i,
  ipa: /\b(fotosintesis|atom|molekul|sel|dna|gravitasi|gaya|energi|listrik|magnet|kimia|reaksi|unsur|senyawa|biologi|fisika|planet|tata surya|respirasi|metamorfosis|ekosistem|organ|jantung|paru)\b/i,
  ips: /\b(sejarah|geografi|ekonomi|sosial|peta|benua|negara|ibu kota|kemerdekaan|proklamasi|perang|kerajaan|ASEAN|PBB|globalisasi|inflasi|pajak|pasar)\b/i,
  indonesia: /\b(puisi|pantun|majas|paragraf|kalimat|kata baku|sinonim|antonim|teks|narasi|deskripsi|eksposisi|argumentasi|prosedur|laporan|pidato|dialog|cerpen|novel|drama)\b/i,
  inggris: /\b(english|grammar|tense|verb|noun|adjective|past|present|future|vocabulary|reading|writing|listening|speaking|translate|translation|meaning|synonym|antonym|sentence|phrase|clause)\b/i,
  umum: /.*/  // fallback
};

// ============ MODE JAWABAN ============
function detectMode(text) {
  const t = text.toLowerCase();
  if (/\b(jelaskan|jelasin|apa itu|apa yang dimaksud|pengertian|definisi|artinya|maksud)\b/.test(t)) return 'explain';
  if (/\b(contoh|contohnya|misal|misalnya|kasih contoh|beri contoh|tunjukkan)\b/.test(t)) return 'example';
  if (/\b(ringkas|rangkum|ringkasan|singkat|poin|kesimpulan)\b/.test(t)) return 'summary';
  if (/\b(latihan|soal|kuis|buat soal|beri soal|tes|uji)\b/.test(t)) return 'quiz';
  if (/\b(terjemah|translate|artinya dalam|bahasa inggris dari|bahasa indonesia dari)\b/.test(t)) return 'translate';
  if (/\b(bandingkan|perbedaan|beda|vs|versus|persamaan)\b/.test(t)) return 'compare';
  if (/\b(langkah|cara|bagaimana|gimana|tutorial|step)\b/.test(t)) return 'steps';
  return 'default';
}

// ============ DETEKSI JENJANG ============
function detectLevel(text) {
  const t = text.toLowerCase();
  if (/\b(sd|kelas [1-6]|anak|sekolah dasar)\b/.test(t)) return 'sd';
  if (/\b(smp|kelas [7-9]|menengah pertama|remaja awal)\b/.test(t)) return 'smp';
  if (/\b(sma|smk|kelas 1[0-2]|menengah atas|kuliah|mahasiswa)\b/.test(t)) return 'sma';
  if (/\b(guru|mengajar|kelas|murid|siswa)\b/.test(t)) return 'guru';
  return 'smp'; // default
}

// ============ DETEKSI MAPEL ============
function detectSubject(text) {
  for (const [subj, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    if (subj !== 'umum' && pattern.test(text)) return subj;
  }
  return 'umum';
}

// ============ BUILD SYSTEM PROMPT DINAMIS ============
function buildSystemPrompt(userText, options = {}) {
  const level = options.level || detectLevel(userText);
  const mode = options.mode || detectMode(userText);
  const subject = options.subject || detectSubject(userText);

  let base = SYSTEM_PROMPTS[level] || SYSTEM_PROMPTS.default;

  // Tambahan konteks mapel
  if (subject !== 'umum') {
    const subjectNames = {
      matematika: 'Matematika',
      ipa: 'IPA (Ilmu Pengetahuan Alam)',
      ips: 'IPS (Ilmu Pengetahuan Sosial)',
      indonesia: 'Bahasa Indonesia',
      inggris: 'Bahasa Inggris'
    };
    base += `\n\nKONTEKS: Pengguna sedang bertanya tentang ${subjectNames[subject] || subject}.`;
  }

  // Tambahan instruksi sesuai mode
  const modeInstructions = {
    explain: '\n\nMODE: PENJELASAN. Jelaskan konsep dengan bahasa sederhana, mulai dari dasar. Gunakan analogi kalau membantu.',
    example: '\n\nMODE: CONTOH. Berikan 1-2 contoh konkret. Kalau soal hitungan, tunjukkan cara mengerjakannya.',
    summary: '\n\nMODE: RANGKUMAN. Berikan poin-poin penting. Maksimal 5 poin. Setiap poin 1-2 kalimat.',
    quiz: '\n\nMODE: LATIHAN. Buat 2-3 soal latihan singkat. Sertakan jawabannya di bawah.',
    translate: '\n\nMODE: TERJEMAHAN. Berikan terjemahan yang natural, bukan kata per kata.',
    compare: '\n\nMODE: PERBANDINGAN. Bandingkan dalam bentuk poin-poin: persamaan dulu, lalu perbedaan.',
    steps: '\n\nMODE: LANGKAH-LANGKAH. Berikan langkah bernomor. Jelas dan urut.',
    default: ''
  };

  base += modeInstructions[mode] || '';

  return base;
}

// ============ UTILITAS ============
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now - record.windowStart > CONFIG.rateLimit.windowMs) {
    rateLimitStore.set(ip, { windowStart: now, count: 1 });
    return { allowed: true, remaining: CONFIG.rateLimit.maxRequests - 1 };
  }

  record.count++;
  if (record.count > CONFIG.rateLimit.maxRequests) {
    const retryAfter = Math.ceil((record.windowStart + CONFIG.rateLimit.windowMs - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  return { allowed: true, remaining: CONFIG.rateLimit.maxRequests - record.count };
}

function getCacheKey(messages) {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return null;
  return last.content.trim().toLowerCase().slice(0, 200);
}

function getFromCache(key) {
  if (!CONFIG.cache.enabled || !key) return null;
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CONFIG.cache.ttlMs) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  if (!CONFIG.cache.enabled || !key) return;
  if (cacheStore.size >= CONFIG.cache.maxSize) {
    const firstKey = cacheStore.keys().next().value;
    cacheStore.delete(firstKey);
  }
  cacheStore.set(key, { data, time: Date.now() });
}

function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .slice(0, 4000)
    .trim();
}

function safeJSONParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// ============ PROVIDER SELECTION ============
function getAvailableProviders() {
  const available = [];
  for (const [id, cfg] of Object.entries(CONFIG.providers)) {
    if (process.env[cfg.envKey]) {
      available.push({ id, ...cfg });
    }
  }
  return available.sort((a, b) => a.priority - b.priority);
}

function pickModel(provider, taskType) {
  if (taskType === 'reasoning' || taskType === 'math') {
    return provider.reasonModel || provider.defaultModel;
  }
  if (taskType === 'fast') {
    return provider.fastModel || provider.defaultModel;
  }
  return provider.defaultModel;
}

function detectTaskType(text) {
  const t = text.toLowerCase();
  if (/\b(hitung|matematika|persamaan|integral|turunan|bukti|analisis|logika|puzzle|teka-teki)\b/i.test(t)) {
    return 'reasoning';
  }
  if (/\b(halo|hai|hi|apa kabar|terima kasih|makasih|oke|sip)\b/i.test(t) && t.length < 40) {
    return 'fast';
  }
  return 'default';
}

// ============ CALL PROVIDER ============
async function callProvider(provider, messages, model, signal) {
  const body = {
    model,
    messages,
    temperature: CONFIG.temperature,
    top_p: CONFIG.topP,
    max_tokens: CONFIG.maxTokens,
    stream: false
  };

  const headers = {
    'Content-Type': 'application/json'
  };

  // Gemini pakai Authorization header juga di endpoint OpenAI-compatible
  headers['Authorization'] = 'Bearer ' + process.env[provider.envKey];

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      errMsg = errData?.error?.message || errData?.error || errMsg;
    } catch {}
    const err = new Error(errMsg);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data;
}

// ============ MAIN HANDLER ============
export default async function handler(req, res) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);

  // ---------- CORS ----------
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ---------- HEALTH CHECK ----------
  if (req.method === 'GET') {
    const available = getAvailableProviders();
    return res.status(200).json({
      status: 'ok',
      app: 'Rajin Belajar Jadi Pintar',
      author: 'Pandana',
      version: '3.0 Pro',
      uptime: Math.floor((Date.now() - stats.startTime) / 1000) + 's',
      providers: available.map(p => ({ id: p.id, name: p.name, active: true })),
      stats: {
        totalRequests: stats.totalRequests,
        totalErrors: stats.totalErrors,
        totalTokensUsed: stats.totalTokensUsed,
        providerUsage: stats.providerUsage,
        cacheSize: cacheStore.size,
        rateLimitIPs: rateLimitStore.size
      }
    });
  }

  // ---------- METHOD CHECK ----------
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan. Gunakan POST.' });
  }

  stats.totalRequests++;

  // ---------- RATE LIMIT ----------
  const ip = getClientIP(req);
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);

  if (!rl.allowed) {
    stats.totalErrors++;
    res.setHeader('Retry-After', rl.retryAfter);
    return res.status(429).json({
      error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfter} detik ya. 🐢`,
      retryAfter: rl.retryAfter
    });
  }

  // ---------- PARSE BODY ----------
  let body = req.body;
  if (typeof body === 'string') {
    body = safeJSONParse(body);
  }
  if (!body || typeof body !== 'object') {
    stats.totalErrors++;
    return res.status(400).json({ error: 'Body permintaan tidak valid.' });
  }

  let { messages } = body;

  // Kalau ada field "prompt" saja, konversi
  if (!messages && body.prompt) {
    messages = [{ role: 'user', content: String(body.prompt) }];
  }

  // Validasi
  if (!Array.isArray(messages) || messages.length === 0) {
    stats.totalErrors++;
    return res.status(400).json({ error: 'Field "messages" harus array dan tidak kosong.' });
  }

  // ---------- PREPARE MESSAGES ----------
  // Ambil pesan user terakhir
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser || !lastUser.content) {
    stats.totalErrors++;
    return res.status(400).json({ error: 'Tidak ada pertanyaan dari user.' });
  }

  const userText = sanitizeInput(String(lastUser.content));
  if (userText.length < 1) {
    stats.totalErrors++;
    return res.status(400).json({ error: 'Pertanyaan kosong.' });
  }

  // ---------- CACHE CHECK ----------
  const cacheKey = getCacheKey(messages);
  const cached = getFromCache(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached);
  }
  res.setHeader('X-Cache', 'MISS');

  // ---------- BUILD SYSTEM PROMPT ----------
  const systemPrompt = buildSystemPrompt(userText);

  // Batasi history
  const trimmedMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-CONFIG.historyLimit)
    .map(m => ({
      role: m.role,
      content: sanitizeInput(String(m.content || ''))
    }))
    .filter(m => m.content.length > 0);

  const finalMessages = [
    { role: 'system', content: systemPrompt },
    ...trimmedMessages
  ];

  // ---------- DETEKSI TASK ----------
  const taskType = detectTaskType(userText);

  // ---------- AVAILABLE PROVIDERS ----------
  const providers = getAvailableProviders();

  if (providers.length === 0) {
    stats.totalErrors++;
    return res.status(500).json({
      error: 'Belum ada API key AI yang diset. Tambahkan GROQ_API_KEY (atau GEMINI_API_KEY / OPENAI_API_KEY) di Environment Variables Vercel, lalu Redeploy.',
      hint: 'Kunjungi https://console.groq.com/keys untuk API key gratis.'
    });
  }

  // ---------- ATTEMPT EACH PROVIDER ----------
  const errors = [];

  for (const provider of providers) {
    const model = pickModel(provider, taskType);
    
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeout);

        const data = await callProvider(provider, finalMessages, model, controller.signal);
        clearTimeout(timeout);

        // Track usage
        stats.providerUsage[provider.id] = (stats.providerUsage[provider.id] || 0) + 1;

        // Ambil token usage kalau ada
        if (data.usage?.total_tokens) {
          stats.totalTokensUsed += data.usage.total_tokens;
        }

        // Normalisasi response ke format OpenAI
        let normalized = data;

        // Kalau provider kembalikan format beda
        if (!data.choices && data.candidates) {
          const text = data.candidates[0]?.content?.parts?.[0]?.text || '';
          normalized = {
            choices: [{ message: { role: 'assistant', content: text } }]
          };
        }

        // Tambahkan metadata
        normalized._meta = {
          provider: provider.id,
          providerName: provider.name,
          model: model,
          taskType: taskType,
          latency: Date.now() - startTime,
          requestId: requestId
        };

        // Simpan ke cache
        setCache(cacheKey, normalized);

        res.setHeader('X-Provider', provider.name);
        res.setHeader('X-Model', model);
        res.setHeader('X-Latency', (Date.now() - startTime) + 'ms');

        return res.status(200).json(normalized);

      } catch (err) {
        // Kalau abort (timeout), coba lagi
        if (err.name === 'AbortError') {
          errors.push(`[${provider.name}] Timeout setelah ${CONFIG.requestTimeout}ms`);
          continue;
        }
        // Kalau 4xx dari provider, jangan retry
        if (err.status && err.status >= 400 && err.status < 500) {
          errors.push(`[${provider.name}] ${err.message}`);
          break; // lanjut provider lain
        }
        // Error lain, retry
        errors.push(`[${provider.name}] ${err.message}`);
      }
    }
  }

  // ---------- SEMUA PROVIDER GAGAL ----------
  stats.totalErrors++;
  return res.status(502).json({
    error: 'Semua provider AI sedang sibuk. Coba lagi sebentar ya. 🙏',
    details: errors,
    requestId: requestId,
    tip: 'Kalau sering gagal, cek kuota API key atau ganti provider di Environment Variables.'
  });
  }
