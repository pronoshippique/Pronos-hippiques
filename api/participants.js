export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');

  const { date, r, c } = req.query;
  if (!date || !r || !c) {
    return res.status(400).json({ error: 'Paramètres manquants: date, r, c' });
  }

  try {
    const url = `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/participants?metier=INTERNET`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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

    res.json({ success: true, participants });
  } catch (e) {
    res.json({ success: false, error: e.message, participants: [] });
  }
}
