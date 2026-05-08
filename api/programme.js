
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');
  try {
    const r = await fetch('https://www.boturfers.fr/programme-pmu-du-jour', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      }
    });
    const html = await r.text();

    // Extraire hippodromes
    const hippos = [...new Set(
      [...html.matchAll(/l['']hippodrome\s+(?:de\s+)?([A-ZÀÂÉÈÊËÎÏÔÙÛÜ][A-ZÀÂÉÈÊËÎÏÔÙÛÜ\s\-]+?)(?:\s+(?:qui|avec|est|de|accueille)|[,<"'])/gi)]
      .map(m => m[1].trim().replace(/\s+/g,' '))
      .filter(h => h.length > 3 && h.length < 40)
    )];

    // Extraire noms de courses
    const prixMatches = [...html.matchAll(/Prix\s+(?:De\s+|Du\s+|Des\s+|De\s+La\s+|D['']\s*)?([A-ZÀÂÉÈÊË][^<"\\]{2,40}?)(?=<|"|\\|du\s+\d)/gi)]
      .map(m => ('Prix ' + m[1]).trim().replace(/\s+/g,' '))
      .filter(p => p.length > 5 && !p.includes('class') && !p.includes('http'));

    // Horaires
    const heures = [...new Set([...html.matchAll(/(\d{1,2}h\d{2})/g)].map(m=>m[1]))];

    // Construire les réunions
    const reunions = [];
    const hipposUniques = [...new Set(hippos)].slice(0,6);
    const coursesUniques = [...new Set(prixMatches)].slice(0,40);
    const heuresUniques = heures.slice(0,40);

    let courseIndex = 0;
    let heureIndex = 0;

    hipposUniques.forEach((hipp, ri) => {
      const nbCourses = Math.min(7, Math.max(4, Math.floor(coursesUniques.length / hipposUniques.length)));
      const courses = [];
      for (let ci = 0; ci < nbCourses && courseIndex < coursesUniques.length; ci++) {
        courses.push({
          id: `C${ci+1}`,
          ref: `R${ri+1} C${ci+1}`,
          nom: coursesUniques[courseIndex++],
          type: 'Plat',
          dist: '1600m',
          part: 10,
          heure: heuresUniques[heureIndex++] || '--h--',
          terrain: 'Bon',
          quinte: ci === 0 && ri === 0,
          partantsData: []
        });
      }
      if (courses.length > 0) {
        reunions.push({ id: `R${ri+1}`, hippodrome: hipp, courses });
      }
    });

    res.json({ success: true, reunions });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
