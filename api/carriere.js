export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  // ids: comma-separated list of PMU horse IDs
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids requis' });

  const idList = ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  const results = await Promise.allSettled(
    idList.map(async id => {
      const url = `https://online.turfinfo.api.pmu.fr/rest/client/1/cheval/${id}/cariere?metier=INTERNET`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // Extract last 5 races from career
      const participations = data.participations || data.coursesPrecedentes || [];
      const derniersCourses = participations.slice(0, 5).map(c => ({
        date: c.dateReunion || c.date || '',
        hippodrome: c.hippodrome?.libelleCourt || c.hippodrome || '',
        discipline: c.discipline || '',
        distance: c.distance ? `${c.distance}m` : '',
        position: c.ordreArrivee || c.position || null,
        nombrePartants: c.nombrePartants || null,
        temps: c.tempsObtenu || null,
        terrain: c.terrain || '',
        cote: c.indiceCote || null,
      }));

      return { id, carriere: derniersCourses };
    })
  );

  const carriere = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      carriere[r.value.id] = r.value.carriere;
    }
  }

  res.json({ success: true, carriere });
}
