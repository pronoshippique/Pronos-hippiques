export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.zone-turf.fr/programme/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.google.fr'
      }
    });
    const html = await r.text();
    
    // Extraire les réunions depuis le HTML
    const reunions = [];
    const reunionMatches = html.matchAll(/R(\d+)[^<]*<[^>]*>([^<]+hippodrome[^<]*|[A-Z][A-Z\-]+)/gi);
    
    // Parser simplifié - chercher les hippodromes
    const hippoMatches = [...html.matchAll(/reunion[_-]?(\d+)[^"]*"[^>]*>([A-ZÀÂÉÈÊË][A-ZÀÂÉÈÊËa-zàâéèêë\s\-]+)</g)];
    
    res.json({ 
      success: true, 
      reunions: [],
      html_length: html.length,
      sample: html.substring(0, 500)
    });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
