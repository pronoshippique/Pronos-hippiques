export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60');

  const { date, r, c } = req.query;
  if (!date || !r || !c) {
    return res.status(400).json({ error: 'Paramètres manquants: date, r, c' });
  }

  // Try rapports-simples first (live pre-race), then rapports-definitifs (post-race)
  const endpoints = [
    `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/rapports-simples?metier=INTERNET`,
    `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${date}/R${r}/C${c}/rapports-definitifs?metier=INTERNET`,
  ];

  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  for (const url of endpoints) {
    try {
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!resp.ok) continue;
      const data = await resp.json();

      // PMU rapports may be under different keys depending on endpoint
      const rapports = data.rapportsSimples || data.rapportsDefinitifs || [];
      if (!rapports.length) continue;

      // Find SIMPLE_GAGNANT or first available win-type pari
      const winTypes = ['SIMPLE_GAGNANT', 'E_SIMPLE_GAGNANT', 'GAGNANT', 'SIMPLE'];
      let simpleG = null;
      for (const type of winTypes) {
        simpleG = rapports.find(r => r.typePari === type);
        if (simpleG) break;
      }
      // Fallback: first rapports entry
      if (!simpleG) simpleG = rapports[0];

      const participants = simpleG?.participants || [];
      const cotesMap = {};
      for (const p of participants) {
        const num = p.numPmu;
        if (!num) continue;
        // PMU uses different field names: rapport (decimal), indiceCote (integer ×10), dividende
        let val = p.rapport ?? p.indiceCote ?? p.dividende ?? null;
        if (val == null) continue;
        // indiceCote is often stored as integer × 10 (e.g. 42 = 4.2)
        if (typeof val === 'number' && val > 20 && Number.isInteger(val)) {
          val = (val / 10).toFixed(1);
        }
        cotesMap[num] = String(val);
      }

      if (Object.keys(cotesMap).length > 0) {
        return res.json({ success: true, cotes: cotesMap });
      }
    } catch (_) {}
  }

  res.json({ success: false, cotes: {} });
}
