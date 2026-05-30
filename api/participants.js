const HTML_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const { date, r, c } = req.query;
  if (!date || !r || !c) {
    return res.status(400).json({ error: 'Paramètres manquants: date, r, c' });
  }

  // ── 1. PMU OFFICIEL ──
  try {
    const url = `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/participants?metier=INTERNET`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': HTML_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error(`PMU HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.participants) throw new Error('Pas de participants');

    const participants = data.participants.map(p => ({
      numPmu: p.numPmu,
      nom: p.nom,
      chevalId: p.cheval?.id || p.idCheval || null,
      driver: p.driver || '',
      driverId: p.driverChange?.idDriver || p.idDriver || null,
      entraineur: p.entraineur || '',
      age: p.age,
      sexe: p.sexe,
      musique: p.musique || '',
      nonPartant: p.statut === 'NON_PARTANT',
      indiceCote: p.indiceCote || null,
    }));

    return res.json({ success: true, source: 'pmu', participants });
  } catch (e) {
    // PMU failed — try Equidia
  }

  // ── 2. FALLBACK : EQUIDIA (données brutes uniquement — numéros, noms, jockeys) ──
  try {
    // Convert DDMMYYYY → YYYY-MM-DD
    const y = date.slice(4, 8), mo = date.slice(2, 4), d = date.slice(0, 2);
    const equidiaUrl = `https://www.equidia.fr/courses/${y}-${mo}-${d}/R${r}/C${c}`;
    const resp2 = await fetch(equidiaUrl, {
      headers: HTML_HEADERS,
      signal: AbortSignal.timeout(8000)
    });
    if (!resp2.ok) throw new Error(`Equidia HTTP ${resp2.status}`);
    const html = await resp2.text();

    const participants = [];

    // num-partant blocks in actual DOM have pattern: class="...num-partant...">  N  </div>
    const numRe = /class="[^"]*num-partant[^"]*">[^\d]*(\d{1,2})[^\d<]*<\/div>/g;
    let nm;
    while ((nm = numRe.exec(html)) !== null) {
      const numPmu = parseInt(nm[1]);
      if (numPmu < 1 || numPmu > 30) continue;

      // Horse name within ~1000 chars after num-partant
      const segment = html.slice(nm.index, nm.index + 1000);
      const nameM = segment.match(/class="[^"]*name-cheval[^"]*">([^<]{2,40})/);
      if (!nameM) continue;
      const nom = nameM[1].replace(/<!--.*?-->/gs, '').trim();
      if (!nom || nom.length < 2) continue;

      // Jockey: first span after name-cheval containing "X | Y" pattern
      const afterName = segment.slice(segment.indexOf(nameM[0]) + nameM[0].length);
      const jockeyM = afterName.match(/<span[^>]*>([^|<]{2,30})\|/);
      const driver = jockeyM ? jockeyM[1].replace(/<!--.*?-->/gs, '').trim() : '';

      if (!participants.some(p => p.numPmu === numPmu)) {
        participants.push({ numPmu, nom, driver, nonPartant: false, source: 'equidia' });
      }
    }

    if (!participants.length) throw new Error('Equidia: aucun partant parsé');
    participants.sort((a, b) => a.numPmu - b.numPmu);

    return res.json({ success: true, source: 'equidia', participants });
  } catch (e2) {
    res.json({ success: false, error: e2.message, participants: [] });
  }
}
