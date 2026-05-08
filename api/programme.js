
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.zone-turf.fr/programme/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Referer': 'https://www.google.fr'
      }
    });
    const html = await r.text();
    
    const reunions = [];
    
    // Extraire les blocs de réunions
    const blocksR = html.split(/reunion|R\d+\s*[-–]/i);
    
    // Chercher hippodromes
    const hippos = [...html.matchAll(/(?:hippodrome|reunion)[^>]*?>([A-ZÀÂÉÈÊË][A-ZÀÂÉÈÊËa-zàâéèêë\s\-]+)(?:<|\/)/g)].map(m => m[1].trim()).filter(h => h.length > 2);
    
    // Chercher courses
    const courses_found = [...html.matchAll(/Prix\s+(?:de\s+|du\s+|des\s+|d'|la\s+)?([A-ZÀÂÉÈÊË][a-zàâéèêëA-Z\s\-']+)/g)].map(m => m[0].trim());
    
    res.json({ 
      success: true,
      reunions: [],
      hippos: hippos.slice(0,20),
      courses: courses_found.slice(0,20),
      html_size: html.length
    });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
