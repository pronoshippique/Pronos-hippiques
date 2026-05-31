// Server-side proxy to Anthropic API — keeps ANTHROPIC_API_KEY on the server
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { type: 'config_error', message: 'ANTHROPIC_API_KEY non configurée dans Vercel' }
    });
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(55000)
    });
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch(e) {
    return res.status(500).json({
      error: { type: 'proxy_error', message: e.message }
    });
  }
}
