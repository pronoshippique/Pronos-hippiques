export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');

  // Date Paris (DDMMYYYY)
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = fmt.formatToParts(new Date());
  const day   = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const year  = parts.find(p => p.type === 'year').value;
  const dateStr = `${day}${month}${year}`;

  const toTitle = s => s.split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '')
    .join(' ');

  // ── 1. PMU API OFFICIELLE ──
  try {
    const r = await fetch(
      `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${dateStr}?metier=INTERNET`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!r.ok) throw new Error(`PMU HTTP ${r.status}`);
    const data = await r.json();
    if (!data.programme?.reunions?.length) throw new Error('PMU réponse vide');

    const heureFmt = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit'
    });
    const typeMap = {
      ATTELE: 'Trot attelé', MONTE: 'Trot monté',
      PLAT: 'Plat', HAIE: 'Haies',
      STEEPLECHASE: 'Steeple-chase', CROSS: 'Cross'
    };

    const reunions = data.programme.reunions
      .map(reu => ({
        id: `R${reu.numOfficiel}`,
        hippodrome: toTitle(reu.hippodrome.libelleCourt),
        pays: reu.pays?.code === 'FRA' ? 'France' : (reu.pays?.libelle || reu.pays?.code || ''),
        courses: reu.courses.map(c => ({
          id:   `C${c.numOrdre}`,
          ref:  `R${reu.numOfficiel} C${c.numOrdre}`,
          nom:  toTitle(c.libelle),
          type: typeMap[c.discipline] || c.discipline,
          dist: `${c.distance}m`,
          part: c.nombreDeclaresPartants || 10,
          heure: heureFmt.format(new Date(c.heureDepart)).replace(':', 'h'),
          terrain: 'Bon',
          quinte: !!(c.paris?.some(p => p.typePari === 'QUINTE_PLUS')),
          // champs pour l'API participants
          numReunion: reu.numOfficiel,
          numCourse:  c.numOrdre,
          dateStr,
          partantsData: []
        }))
      }))
      .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    return res.json({ success: true, source: 'pmu', reunions });

  } catch (e) {
    console.warn('PMU API failed:', e.message, '— fallback boturfers');
  }

  // ── 2. FALLBACK : SCRAPING BOTURFERS ──
  try {
    const r = await fetch('https://www.boturfers.fr/programme-pmu-du-jour', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`boturfers HTTP ${r.status}`);
    const html = await r.text();

    // Hippodrome names from nav tabs
    const hippoMap = {};
    const tabRe = /<div[^>]+class="reu[^"]*">(R\d+)<\/div><\/div>\s*<div[^>]+class="name[^"]*"[^>]*>([^<]+)<\/div>/g;
    let tm;
    while ((tm = tabRe.exec(html)) !== null) {
      hippoMap[tm[1].toUpperCase()] = tm[2].trim();
    }
    if (!Object.keys(hippoMap).length) throw new Error('boturfers: aucun hippodrome');

    const reunions = [];
    const sectionStartRe = /<div[^>]+id="(r\d+)"[^>]+role="tabpanel"[^>]*>/g;
    const tbodyRe = /<tbody[^>]*>([\s\S]*?)<\/tbody>/g;

    let sm;
    while ((sm = sectionStartRe.exec(html)) !== null) {
      const sectionId = sm[1];
      const rKey = sectionId.replace('r', 'R');
      const rNum = parseInt(sectionId.slice(1));

      tbodyRe.lastIndex = sm.index;
      const tbodyM = tbodyRe.exec(html);
      if (!tbodyM) continue;
      const tbodyHtml = tbodyM[1];

      const courses = [];
      let courseNum = 1;
      const rowRe = /<tr(\s[^>]*)?>([\s\S]*?)<\/tr>/g;
      let rm;
      while ((rm = rowRe.exec(tbodyHtml)) !== null) {
        const trAttrs = rm[1] || '';
        const rowHtml = rm[2];
        const heureM = rowHtml.match(/<span class="txt">(\d+h\d+)<\/span>/);
        if (!heureM) continue;
        const heure = heureM[1];
        const isQuinte = /\bquinte\b/.test(trAttrs);
        const refM = rowHtml.match(/class="obflink rxcx[^"]*">(R\d+\s+C\d+)<\/span>/);
        const ref = refM ? refM[1].replace(/\s+/, ' ') : `R${rNum} C${courseNum}`;
        const nomM = rowHtml.match(/<span class="name fw-600 fs-15px">\s*<a[^>]*>([^<]+)<\/a>/);
        const nom = nomM ? nomM[1].trim() : `Course ${courseNum}`;
        let type = 'Plat', dist = '';
        const caracM = rowHtml.match(/class="carac">([^<]+)<\/span>/);
        if (caracM) {
          const raw = caracM[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          const dm = raw.match(/(\d[\d ]*m)$/);
          if (dm) { dist = dm[1].replace(/\s/g, ''); type = raw.slice(0, raw.length - dm[1].length).trim(); }
          else { type = raw; }
        }
        const nbM = rowHtml.match(/<td class="nb">(\d+)<\/td>/);
        const part = nbM ? parseInt(nbM[1]) : 10;

        courses.push({
          id: `C${courseNum}`, ref, nom, type, dist, part, heure,
          terrain: 'Bon', quinte: isQuinte,
          numReunion: rNum, numCourse: courseNum, dateStr,
          partantsData: []
        });
        courseNum++;
      }
      if (courses.length > 0) {
        reunions.push({ id: rKey, hippodrome: hippoMap[rKey] || rKey, pays: 'France', courses });
      }
    }

    reunions.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    if (!reunions.length) throw new Error('boturfers: aucune réunion extraite');

    return res.json({ success: true, source: 'boturfers', reunions });

  } catch (e2) {
    res.json({ success: false, error: e2.message });
  }
}
