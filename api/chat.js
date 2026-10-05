module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { messages } = req.body;
    const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
    let last = { status: 500, data: { error: "Server error" } };
    for (const model of models) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, reasoning_effort: "low" }),
      });
      const data = await r.json();
      if (r.ok) return res.status(200).json(data);
      last = { status: r.status, data };
      if (r.status !== 400 && r.status !== 404) break;
    }
    return res.status(last.status).json(last.data);
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
