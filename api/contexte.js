// Scrapes Geny for two types of data not available from PMU:
// 1. Real terrain condition + penetrometer from the programme page
// 2. Horse weights + live cotes from the individual course page
// Used as context for the AI — no pronostics from Geny are copied.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-FR,fr;q=0.9',
};

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800');

  const { date, r, c } = req.query;
  if (!date || !r || !c) return res.status(400).json({ error: 'date, r, c requis' });

  // Convert DDMMYYYY → YYYY-MM-DD for Geny URLs
  const y = date.slice(4, 8), mo = date.slice(2, 4), d = date.slice(0, 2);
  const genyDate = `${y}-${mo}-${d}`;
  const rNum = parseInt(r), cNum = parseInt(c);

  let terrain = null, penetrometre = null, courseUrl = null, horses = [], conditionCourse = '';

  // ── 1. Programme page → terrain + course URL ──
  try {
    const progResp = await fetch(`https://www.geny.com/reunions-courses-pmu/_d${genyDate}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(9000)
    });
    if (!progResp.ok) throw new Error(`Geny programme HTTP ${progResp.status}`);
    const progHtml = await progResp.text();

    // Find the reunion{r} anchor section
    const anchor = `id="reunion${rNum}"`;
    const secStart = progHtml.indexOf(anchor);
    if (secStart === -1) throw new Error(`reunion${rNum} non trouvée`);
    const nextAnchor = progHtml.indexOf(`id="reunion${rNum + 1}"`, secStart + 1);
    const secHtml = progHtml.slice(secStart, nextAnchor > secStart ? nextAnchor : secStart + 10000);

    // Terrain: "Terrain : Bon souple Pénétromètre : 3.4"
    const terrainM = secHtml.match(/Terrain\s*:\s*([\w\s-]+?)(?:\s*Pénétromètre\s*:\s*([\d.,]+))?(?:\s*<|\s*\n|\s*\()/i);
    if (terrainM) {
      terrain = terrainM[1].trim();
      penetrometre = terrainM[2] ? terrainM[2].trim() : null;
    }

    // All course links in this reunion section, in order
    const links = [...secHtml.matchAll(/href="(\/partants-pmu\/[^"]+)"/g)].map(m => m[1]);
    courseUrl = links[cNum - 1] || null;

  } catch (e) {
    // Terrain not available — continue to course scrape anyway
  }

  // ── 2. Individual course page → horse weights, cotes, condition ──
  if (courseUrl) {
    try {
      const courseResp = await fetch(`https://www.geny.com${courseUrl}`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(9000)
      });
      if (!courseResp.ok) throw new Error(`Geny course HTTP ${courseResp.status}`);
      const courseHtml = await courseResp.text();

      // Terrain from course page (more specific than programme page)
      const condM = courseHtml.match(/conditionCourse[^>]*>([\s\S]{0,600}?)<\/(?:div|td|p)>/);
      if (condM) {
        conditionCourse = stripTags(condM[1]).slice(0, 350);
        if (!terrain) {
          const t2 = conditionCourse.match(/Terrain\s*:\s*([\w\s-]+?)(?:\s*-\s*Pénétromètre\s*:\s*([\d.,]+))?(?:\s|$)/i);
          if (t2) { terrain = t2[1].trim(); penetrometre = t2[2] || null; }
        }
      }

      // Horse table: N° | Cheval | SA | Poids | Déch. | Jockey | Entraîneur | Musique | Valeur | Cotes ref | Cotes live
      const tableIdx = courseHtml.indexOf('tableau_technique');
      const tbodyStart = courseHtml.indexOf('<tbody>', tableIdx);
      const tbodyEnd = courseHtml.indexOf('</tbody>', tbodyStart);

      if (tbodyStart !== -1 && tbodyEnd !== -1) {
        const tbody = courseHtml.slice(tbodyStart, tbodyEnd);
        const rowRe = /<tr>([\s\S]+?)<\/tr>/g;
        let rowM;
        while ((rowM = rowRe.exec(tbody)) !== null) {
          const cells = [...rowM[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => stripTags(m[1]));
          if (cells.length < 6) continue;
          const num = parseInt(cells[0]);
          if (!num || num < 1 || num > 30) continue;
          horses.push({
            num,
            nom: cells[1]?.split(/\s+/).slice(0, 4).join(' ') || '',
            sa: cells[2] || '',
            poids: cells[3] || '',
            jockey: cells[5] || '',
            musique: cells[7] || '',
            coteRef: cells[9] || '',
            coteLive: cells[10] || '',
          });
        }
      }

    } catch (e) {
      // Course scrape failed — return what we have
    }
  }

  res.json({
    success: !!(terrain || horses.length),
    terrain,
    penetrometre,
    conditionCourse,
    horses,
    source: 'geny',
  });
}
