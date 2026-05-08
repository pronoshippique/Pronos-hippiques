
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');
  try {
    const r = await fetch('https://www.boturfers.fr/programme-pmu-du-jour', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      }
    });
    const html = await r.text();
    // Chercher les reunions et courses dans le HTML
    const reunions = [];
    const hippoMatches = [...html.matchAll(/hippodrome[^>]*>([^<]{3,40})</gi)];
    const courseMatches = [...html.matchAll(/Prix\s+[A-ZÀ-Ü][^<]{2,50}/g)];
    const heureMatches = [...html.matchAll(/(\d{1,2}h\d{2})/g)];
    res.json({
      success: true,
      hippos: [...new Set(hippoMatches.map(m=>m[1].trim()))].slice(0,10),
      courses: courseMatches.map(m=>m[0].trim()).slice(0,20),
      heures: heureMatches.map(m=>m[1]).slice(0,20),
      size: html.length
    });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
