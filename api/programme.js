
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  try {
    const r = await fetch(
      `https://turfinfo.api.pmu.fr/rest/client/2/programme/${yyyy}${mm}${dd}?specialisation=INTERNET`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pmu.fr' } }
    );
    const d = await r.json();
    const reunionsRaw = d.programme?.reunions || [];
    const reunions = reunionsRaw.slice(0,7).map((r,i) => ({
      id:`R${i+1}`,
      hippodrome: r.hippodrome?.nom || `R${i+1}`,
      courses: (r.courses||[]).slice(0,9).map((c,j) => ({
        id:`C${j+1}`, ref:`R${i+1} C${j+1}`,
        nom: c.libelle || `Course ${j+1}`,
        type: c.discipline || 'Plat',
        dist: `${c.distance||1600}m`,
        part: c.nombreDeclaresPartants || 10,
        heure: c.heureDepart ? new Date(c.heureDepart).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}).replace(':','h') : '--h--',
        terrain: c.conditionsPiste || 'Bon',
        quinte: c.categorieStatut === 'QUINTE_PLUS',
        partantsData: []
      }))
    })).filter(r => r.courses.length > 0);
    res.json({ success: true, reunions, total: reunionsRaw.length });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
