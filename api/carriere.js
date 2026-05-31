const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
};

function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch(_) { return ''; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600');

  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids requis' });

  const idList = String(ids).split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);

  const results = await Promise.allSettled(
    idList.map(async id => {
      const resp = await fetch(
        `https://online.turfinfo.api.pmu.fr/rest/client/1/cheval/${id}/cariere?metier=INTERNET`,
        { headers: HEADERS, signal: AbortSignal.timeout(6000) }
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // PMU returns different field names depending on version
      const participations = data.coursesCourues || data.participations
        || data.coursesPrecedentes || data.performances || [];

      const total  = participations.length;
      const wins   = participations.filter(c => (c.ordreArrivee ?? c.position) === 1).length;
      const places = participations.filter(c => {
        const p = c.ordreArrivee ?? c.position;
        return p && p <= 3;
      }).length;

      const courses = participations.slice(0, 6).map(c => ({
        date:         fmtDate(c.dateReunion || c.date),
        hippodrome:   c.hippodrome?.libelleCourt || c.hippodrome || '',
        discipline:   c.discipline || '',
        distance:     c.distance ? `${c.distance}m` : '',
        position:     c.ordreArrivee ?? c.position ?? null,
        partants:     c.nombreDeclaresPartants ?? c.nombrePartants ?? null,
        terrain:      c.terrain || '',
        temps:        c.tempsObtenu || null,
      }));

      return { id, total, wins, places, courses };
    })
  );

  const carriere = {};
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { id, total, wins, places, courses } = r.value;
      carriere[id] = { total, wins, places, courses };
    }
  }

  res.json({ success: true, carriere });
}
