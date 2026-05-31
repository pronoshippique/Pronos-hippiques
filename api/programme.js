const PMU_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

async function fetchPartants(dateStr, numReunion, numCourse) {
  try {
    const resp = await fetch(
      `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${dateStr}/R${numReunion}/C${numCourse}/participants?metier=INTERNET&fields=ALL`,
      { headers: PMU_HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.participants || []).map(p => ({
      numPmu:     p.numPmu,
      nom:        p.nom || '',
      driver:     p.driver || '',
      chevalId:   p.cheval?.id || p.idCheval || null,
      driverId:   p.driverChange?.idDriver || p.idDriver || null,
      age:        p.age || null,
      sexe:       p.sexe || '',
      musique:    p.musique || '',
      indiceCote: p.indiceCote || null,
      nonPartant: p.statut === 'NON_PARTANT',
    }));
  } catch(_) { return []; }
}

// Enrichit les 3 premières réunions françaises avec les vrais partants (en parallèle)
async function enrichWithPartants(reunions) {
  const targets = reunions.filter(r => r.pays === 'France').slice(0, 3);
  await Promise.allSettled(
    targets.flatMap(reu =>
      reu.courses.map(async c => {
        c.partantsData = await fetchPartants(c.dateStr, c.numReunion, c.numCourse);
      })
    )
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');
  try { await _handler(req, res); } catch (fatal) {
    console.error('programme.js FATAL:', fatal);
    res.status(500).json({ success: false, error: fatal.message, stack: fatal.stack });
  }
}

async function _handler(req, res) {

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

    await enrichWithPartants(reunions);
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

    await enrichWithPartants(reunions);
    return res.json({ success: true, source: 'boturfers', reunions });

  } catch (e2) {
    console.warn('boturfers failed:', e2.message, '— fallback equidia');
  }

  // ── 3. FALLBACK : SCRAPING EQUIDIA (données brutes uniquement) ──
  try {
    const r3 = await fetch('https://www.equidia.fr/courses-hippique', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!r3.ok) throw new Error(`Equidia HTTP ${r3.status}`);
    const html = await r3.text();

    // Find all course-card links: href="/courses/YYYY-MM-DD/Rn/Cn"
    const linkRe = /href="\/courses\/(\d{4}-\d{2}-\d{2})\/(R(\d+))\/(C(\d+))"/g;
    const links = [];
    let lm;
    while ((lm = linkRe.exec(html)) !== null) {
      links.push({
        equidiaDate: lm[1], rKey: lm[2], rNum: parseInt(lm[3]),
        cKey: lm[4], cNum: parseInt(lm[5]), pos: lm.index
      });
    }
    if (!links.length) throw new Error('Equidia: aucun lien course trouvé');

    const reunionsMap = {};
    for (let i = 0; i < links.length; i++) {
      const { equidiaDate, rKey, rNum, cKey, cNum, pos } = links[i];
      const nextPos = i + 1 < links.length ? links[i + 1].pos : pos + 2000;
      const block = html.slice(pos, Math.min(nextPos, pos + 2000));

      const heureM  = block.match(/course-card--time--hours[^>]*>(\d{1,2}:\d{2})/);
      const hippoM  = block.match(/description--lieu[^>]*>[\s\S]{0,200}?<span[^>]*>([^<]+)</);
      const nomM    = block.match(/description--prix[^>]*>\s*([^<\n]{2,60})\s*</);
      const textM   = block.match(/<b>(\d+)\s*[Pp]artants?<\/b>[^|]*\|([^|]+)\|([^|]*)\|([^|<€]{0,30})/);

      const heure      = heureM ? heureM[1].replace(':', 'h') : '?h??';
      const hippodrome = hippoM ? hippoM[1].trim() : rKey;
      const nom        = nomM   ? nomM[1].trim()  : `Course ${cNum}`;
      const part       = textM  ? parseInt(textM[1]) : 10;
      const discipline = textM  ? textM[2].trim() : '';
      const distRaw    = textM  ? textM[4].trim() : '';
      const distM      = distRaw.match(/(\d+\s*m)/i);
      const dist       = distM  ? distM[1].replace(/\s/, '').toLowerCase() : '';
      const isQuinte   = /quinté\+|quinte\+/i.test(block);

      // DDMMYYYY for PMU API compatibility
      const [y, mo, d] = equidiaDate.split('-');
      const dateStrDDMMYYYY = `${d}${mo}${y}`;

      if (!reunionsMap[rKey]) {
        reunionsMap[rKey] = { id: rKey, hippodrome: toTitle(hippodrome), pays: 'France', courses: [] };
      }
      if (!reunionsMap[rKey].courses.some(c => c.id === cKey)) {
        reunionsMap[rKey].courses.push({
          id: cKey, ref: `${rKey} ${cKey}`, nom: toTitle(nom),
          type: discipline, dist, part, heure,
          terrain: 'Bon', quinte: isQuinte,
          numReunion: rNum, numCourse: cNum,
          dateStr: dateStrDDMMYYYY, partantsData: []
        });
      }
    }

    const reunions = Object.values(reunionsMap)
      .sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
    reunions.forEach(reu => reu.courses.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1))));

    if (!reunions.length) throw new Error('Equidia: aucune réunion extraite');
    await enrichWithPartants(reunions);
    return res.json({ success: true, source: 'equidia', reunions });

  } catch (e3) {
    console.error('programme.js — tous les fallbacks ont échoué:', e3);
    res.json({ success: false, error: e3.message, stack: e3.stack });
  }
}
