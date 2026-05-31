// Server-side proxy to Anthropic API — keeps ANTHROPIC_API_KEY on the server
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  console.log('METHOD:', req.method);
  console.log('BODY TYPE:', typeof req.body);
  console.log('BODY:', JSON.stringify(req.body));
  console.log('API KEY EXISTS:', !!process.env.ANTHROPIC_API_KEY);

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  } catch(e) {
    body = {};
  }

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
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000)
    });
    const data = await resp.json();
    console.log('ANTHROPIC STATUS:', resp.status);
    console.log('ANTHROPIC RESPONSE:', JSON.stringify(data).substring(0, 500));
    return res.status(resp.status).json(data);
  } catch(e) {
    return res.status(500).json({
      error: { type: 'proxy_error', message: e.message }
    });
  }
}
