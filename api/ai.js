export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'no key' });
  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body||'{}');
    const partants = (body.partants||[]).map(p=>`N${p.numero} ${p.nom} driver:${p.driver||'?'} musique:${p.musique||'NC'}`).join('\n');
    const c = body.course||{};
    const msg = `Course ${c.nom} a ${c.hippodrome} ${c.dist} ${c.type} terrain:${c.terrain}\nPartants:\n${partants}\nReponds en JSON: {"texte":"analyse 5 lignes","favori":N,"top5":[N1,N2,N3,N4,N5],"analyses":{"N":"texte"},"gagnant":N,"couple":[N1,N2],"rapports":{"gagnant":"4x","place":"2x","couple":"12x"}}`;
    const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:3000,system:'Expert hippique. JSON valide uniquement sans markdown.',messages:[{role:'user',content:msg}]}),signal:AbortSignal.timeout(50000)});
    const txt = await r.text();
    console.log('ST:',r.status,'R:',txt.substring(0,200));
    try { return res.status(r.status).json(JSON.parse(txt)); }
    catch(e) { return res.status(500).json({error:'bad json',raw:txt.substring(0,100)}); }
  } catch(e) { return res.status(500).json({error:e.message}); }
}
