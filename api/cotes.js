export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');

  const { date, r, c } = req.query;
  if (!date || !r || !c) {
    return res.status(400).json({ error: 'Paramètres manquants: date, r, c' });
  }

  // Try rapports-definitifs first, then rapports-simples (pre-race live odds)
  const endpoints = [
    `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/rapports-definitifs?metier=INTERNET`,
    `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/rapports-simples?metier=INTERNET`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!resp.ok) continue;
      const data = await resp.json();

      // Build numPmu → cote map from SIMPLE_GAGNANT rapports
      const cotesMap = {};
      const rapports = data.rapportsDefinitifs || data.rapportsSimples || [];
      const simpleG = rapports.find(r => r.typePari === 'SIMPLE_GAGNANT' || r.typePari === 'E_SIMPLE_GAGNANT');
      if (simpleG?.participants) {
        for (const p of simpleG.participants) {
          if (p.numPmu && p.rapport) cotesMap[p.numPmu] = p.rapport;
        }
      }

      if (Object.keys(cotesMap).length > 0) {
        return res.json({ success: true, cotes: cotesMap });
      }
    } catch (_) {}
  }

  res.json({ success: false, cotes: {} });
}
