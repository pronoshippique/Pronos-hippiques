export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2,'0');
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const yyyy = today.getFullYear();
    const r = await fetch(
      `https://www.geny.com/api/v1/programme?date=${yyyy}-${mm}-${dd}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    const d = await r.json();
    const reunionsRaw = d.data || d.reunions || d.programme || [];
    const reunions = reunionsRaw.slice(0,7).map((r,i) => ({
      id:`R${i+1}`,
      hippodrome: r.hippodrome || r.nom || r.libelle || `R${i+1}`,
      courses: (r.courses||r.races||[]).slice(0,9).map((c,j) => ({
        id:`C${j+1}`, ref:`R${i+1} C${j+1}`,
        nom: c.nom || c.libelle || `Course ${j+1}`,
        type: c.discipline || c.type || 'Plat',
        dist: `${c.distance||1600}m`,
        part: c.partants || c.nombrePartants || 10,
        heure: c.heure || c.depart || '--h--',
        terrain: c.terrain || 'Bon',
        quinte: c.quinte || false,
        partantsData: []
      }))
    })).filter(r => r.courses.length > 0);
    res.json({ success: true, reunions, raw_keys: Object.keys(d) });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
