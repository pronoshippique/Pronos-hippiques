export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300');
  try {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2,'0');
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const yyyy = today.getFullYear();
    const url = `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${yyyy}${mm}${dd}?metier=INTERNET&fields=ALL`;
    const pmu = await fetch(url, {headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0'}});
    if (!pmu.ok) throw new Error('PMU error');
    const data = await pmu.json();
    const reunions = [];
    (data.programme?.reunions || []).forEach((r,ri) => {
      if (ri >= 8) return;
      const rid = `R${r.numOfficiel||ri+1}`;
      const courses = [];
      (r.courses||[]).forEach((c,ci) => {
        if (ci >= 10) return;
        let heure = '--h--';
        if (c.heureDepart) {
          const d = new Date(c.heureDepart);
          heure = `${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`;
        }
        courses.push({
          id:`C${c.numOrdre||ci+1}`,
          ref:`${rid} C${c.numOrdre||ci+1}`,
          nom:c.libelle||`Course ${ci+1}`,
          type:c.discipline||'Plat',
          dist:c.distance?`${c.distance}m`:'?m',
          part:c.nombreDeclaresPartants||(c.partants||[]).length||10,
          heure,
          terrain:c.conditionsPiste||'Bon',
          quinte:c.categorieStatut==='QUINTE_PLUS',
          partan
