
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');
  const today = new Date().toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'});
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Programme PMU du ${today}. JSON uniquement:\n[{"id":"R1","hippodrome":"Vincennes","courses":[{"id":"C1","ref":"R1 C1","nom":"Prix X","type":"Trot attelé","dist":"2175m","part":14,"heure":"13h15","terrain":"Bon","quinte":false}]}]`
        }]
      })
    });
    const d = await r.json();
    const txt = d.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    const match = txt.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no data');
    const reunions = JSON.parse(match[0]);
    res.json({ success: true, reunions });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
