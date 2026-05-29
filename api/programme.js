export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');

  try {
    const r = await fetch('https://www.boturfers.fr/programme-pmu-du-jour', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();

    // ── 1. HIPPODROME MAP from nav tabs ──
    // Pattern: <div class="reu ...">R1</div></div> <div class="name ..." data-status="...">Vincennes</div>
    const hippoMap = {};
    const tabRe = /<div[^>]+class="reu[^"]*">(R\d+)<\/div><\/div>\s*<div[^>]+class="name[^"]*"[^>]*>([^<]+)<\/div>/g;
    let tm;
    while ((tm = tabRe.exec(html)) !== null) {
      hippoMap[tm[1].toUpperCase()] = tm[2].trim();
    }

    if (Object.keys(hippoMap).length === 0) throw new Error('Aucun hippodrome trouvé');

    // ── 2. PARSE COURSES PER REUNION SECTION ──
    // Each section: <div id="r1" role="tabpanel"...> ... <tbody>...</tbody> ... </div>
    const reunions = [];
    const sectionStartRe = /<div[^>]+id="(r\d+)"[^>]+role="tabpanel"[^>]*>/g;
    const tbodyRe = /<tbody[^>]*>([\s\S]*?)<\/tbody>/g;

    let sm;
    while ((sm = sectionStartRe.exec(html)) !== null) {
      const sectionId = sm[1];                       // "r1", "r3", ...
      const rKey = sectionId.replace('r', 'R');      // "R1", "R3", ...
      const rNum = parseInt(sectionId.slice(1));

      // Find the tbody immediately following this section start
      tbodyRe.lastIndex = sm.index;
      const tbodyM = tbodyRe.exec(html);
      if (!tbodyM) continue;
      const tbodyHtml = tbodyM[1];

      const courses = [];
      let courseNum = 1;

      // Parse each <tr> row — quinte rows have class="quinte" on the <tr>
      const rowRe = /<tr(\s[^>]*)?>([\s\S]*?)<\/tr>/g;
      let rm;
      while ((rm = rowRe.exec(tbodyHtml)) !== null) {
        const trAttrs = rm[1] || '';
        const rowHtml = rm[2];

        // Skip header/footer rows (no hour span inside)
        const heureM = rowHtml.match(/<span class="txt">(\d+h\d+)<\/span>/);
        if (!heureM) continue;
        const heure = heureM[1];

        // Quinté+ flag: <tr class="quinte">
        const isQuinte = /\bquinte\b/.test(trAttrs);

        // Course ref — e.g. "R1 C4"
        const refM = rowHtml.match(/class="obflink rxcx[^"]*">(R\d+\s+C\d+)<\/span>/);
        const ref = refM ? refM[1].replace(/\s+/, ' ') : `R${rNum} C${courseNum}`;

        // Course name — inside <span class="name ..."><a ...>Prix Foo</a></span>
        const nomM = rowHtml.match(/<span class="name fw-600 fs-15px">\s*<a[^>]*>([^<]+)<\/a>/);
        const nom = nomM ? nomM[1].trim() : `Course ${courseNum}`;

        // Type + distance — <span class="carac">Attelé &nbsp; 2&nbsp;850m</span>
        let type = 'Plat', dist = '';
        const caracM = rowHtml.match(/class="carac">([^<]+)<\/span>/);
        if (caracM) {
          const raw = caracM[1]
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          // e.g. "Attelé 2 850m" → type="Attelé", dist="2850m"
          const distMatch = raw.match(/(\d[\d ]*m)$/);
          if (distMatch) {
            dist = distMatch[1].replace(/\s/g, '');
            type = raw.slice(0, raw.length - distMatch[1].length).trim();
          } else {
            type = raw;
          }
        }

        // Number of runners — <td class="nb">16</td>
        const nbM = rowHtml.match(/<td class="nb">(\d+)<\/td>/);
        const part = nbM ? parseInt(nbM[1]) : 10;

        courses.push({
          id: `C${courseNum}`,
          ref,
          nom,
          type,
          dist,
          part,
          heure,
          terrain: 'Bon',
          quinte: isQuinte,
          partantsData: []
        });
        courseNum++;
      }

      if (courses.length > 0) {
        reunions.push({
          id: rKey,
          hippodrome: hippoMap[rKey] || rKey,
          pays: 'France',
          courses
        });
      }
    }

    // Sort by reunion number (R1 before R3 before R4…)
    reunions.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));

    if (reunions.length === 0) throw new Error('Aucune réunion extraite');

    res.json({ success: true, reunions });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
}
