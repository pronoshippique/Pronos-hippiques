// api/ai.js — Construit le prompt hippique côté serveur et appelle l'API Anthropic.
// Reçoit : { partants, course, langue, isQuinte }
// Renvoie : la réponse brute d'Anthropic (content[].text contient le JSON pronostics)

function parseMusiqueScore(musique) {
  if (!musique || typeof musique !== 'string' || musique === 'NC')
    return { score: 0, summary: '?', label: 'INCONNU' };
  const results = [];
  let i = 0;
  while (i < musique.length && results.length < 10) {
    const ch = musique[i];
    if (ch >= '1' && ch <= '9') {
      results.push(parseInt(ch)); i++;
      while (i < musique.length && !/[0-9DdAaTt ]/.test(musique[i])) i++;
    } else if (ch === '0') {
      results.push(0); i++;
      while (i < musique.length && !/[0-9DdAaTt ]/.test(musique[i])) i++;
    } else if (ch === 'D' || ch === 'd') {
      results.push('D'); i++;
      while (i < musique.length && !/[0-9DdAaTt ]/.test(musique[i])) i++;
    } else if (ch === 'A' || ch === 'a' || ch === 'T' || ch === 't') {
      results.push('A'); i++;
    } else { i++; }
  }
  if (!results.length) return { score: 0, summary: musique.slice(0, 15), label: 'INCONNU' };
  const last5 = results.slice(0, 5);
  const ptsMap = { 1: 10, 2: 7, 3: 5, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 0: 0, D: -2, A: 0 };
  let total = 0, valid = 0;
  for (const r of last5) { if (r !== 'A') { total += (ptsMap[r] ?? 0); valid++; } }
  const score = valid > 0 ? Math.round((total / Math.min(valid, 5)) * 10) / 10 : 0;
  const summary = last5.map(r => r === 'D' ? 'Dsq' : r === 'A' ? 'Abs' : String(r)).join('-');
  const label = score >= 8 ? 'EN GRANDE FORME' : score >= 5 ? 'EN FORME' : score >= 2 ? 'IRRÉGULIER' : 'À ÉVITER';
  return { score, summary, label };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key missing' });

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const { partants = [], course = {}, langue = 'français', isQuinte = false } = body;

    if (!partants.length) return res.status(400).json({ error: 'Aucun partant fourni' });

    const n = partants.length;

    // ── Scores de forme ──
    const formeMap = {};
    partants.forEach(p => { formeMap[p.numero] = parseMusiqueScore(p.musique); });
    const horsesWithMusique = partants.filter(p => p.musique && p.musique !== 'NC' && p.musique.trim().length > 0);
    const useMusique = horsesWithMusique.length >= Math.ceil(n * 0.4);

    const getCote = p => p.indiceCote ? p.indiceCote / 10 : null;

    const sorted = useMusique
      ? [...partants].sort((a, b) => {
          const fa = formeMap[a.numero].score, fb = formeMap[b.numero].score;
          if (fb !== fa) return fb - fa;
          const ca = getCote(a), cb = getCote(b);
          if (ca === null) return 1; if (cb === null) return -1;
          return ca - cb;
        })
      : [...partants].sort((a, b) => {
          const ca = getCote(a), cb = getCote(b);
          if (ca === null && cb === null) return 0;
          if (ca === null) return 1; if (cb === null) return -1;
          return ca - cb;
        });

    const favori = sorted[0];
    const favoriNum = favori.numero;

    const favoriFormeStr = (favori.musique && favori.musique !== 'NC')
      ? `musique ${formeMap[favoriNum].summary} → score ${formeMap[favoriNum].score}/10 (${formeMap[favoriNum].label})`
      : getCote(favori) ? `cote ${getCote(favori).toFixed(1)}` : 'favori logique';

    const outsiders = sorted.slice(1, 3).map(p => {
      const f = formeMap[p.numero];
      const formeLabel = (p.musique && p.musique !== 'NC') ? ` — musique ${f.summary} (${f.label})` : '';
      const coteStr = getCote(p) ? `, cote ${getCote(p).toFixed(1)}` : '';
      return `N°${p.numero} ${p.nom} (${p.driver || '?'}${coteStr}${formeLabel})`;
    }).join(' et ');

    // ── Bloc de données chevaux ──
    const horsesData = sorted.map(p => {
      const coteStr = getCote(p) ? getCote(p).toFixed(1) : 'NC';
      const forme = formeMap[p.numero];
      const formeStr = (p.musique && p.musique !== 'NC')
        ? `${forme.summary} → score:${forme.score}/10 (${forme.label})`
        : 'NC';
      return `N°${p.numero} ${p.nom} | Driver: ${p.driver || '?'} | Cote: ${coteStr} | Musique: ${formeStr}`;
    }).join('\n');

    // ── Template JSON attendu par le front ──
    const quinteBlock = isQuinte
      ? '  "quarte": [1, 2, 3, 4],\n  "quinte": [1, 2, 3, 4, 5],\n'
      : '';
    const rapportItems = ['    "gagnant": "Xx"', '    "place": "Xx"', '    "couple": "Xx"'];
    if (n >= 10) rapportItems.push('    "deux_sur_4": "Xx"');
    if (isQuinte) { rapportItems.push('    "quarte": "Xx"'); rapportItems.push('    "quinte": "Xx"'); }

    const analysesLines = sorted.map(p => {
      const f = formeMap[p.numero];
      const ms = (p.musique && p.musique !== 'NC')
        ? `Musique ${f.summary} (score ${f.score}/10, ${f.label}).`
        : 'Musique indisponible.';
      return `    "${p.numero}": "${p.nom} (${p.driver || '?'}) : ${ms} 3-4 phrases d'analyse experte. Verdict: FAVORI LOGIQUE / OUTSIDER DANGEREUX / RÉGULIER / IRRÉGULIER / À ÉVITER."`;
    }).join(',\n');

    const terrain = course.terrain || 'Bon';
    const nomCourse = course.nom || '?';
    const hippo = course.hippodrome || '?';

    const systemPrompt = `Tu es Jean-Pierre Martin, consultant hippique professionnel avec 30 ans d'expérience. Tu analyses chaque course avec une expertise absolue. Pour chaque cheval tu fournis :
- Sa musique récente (résultats des dernières courses) : victoires, places, disqualifications
- Son score de forme calculé sur les 5 dernières sorties
- L'analyse du jockey/driver : ses stats, sa forme actuelle, son affinité avec ce cheval
- Les conditions favorables ou défavorables pour ce cheval aujourd'hui
- Un verdict clair parmi : FAVORI LOGIQUE / OUTSIDER DANGEREUX / RÉGULIER / IRRÉGULIER / À ÉVITER

Tu génères OBLIGATOIREMENT :
1. Un paragraphe de présentation de la course (5-8 lignes minimum) qui doit impérativement inclure :
   - Le nom de la course et l'hippodrome
   - Une phrase sur le favori avec sa musique : "N°X NOM avec DRIVER : musique X-X-X, EN GRANDE FORME..."
   - La mention des outsiders dangereux (2-3 chevaux) avec leur musique
   - L'impact des conditions (terrain, distance, discipline) sur les chances
2. Une fiche détaillée pour CHAQUE cheval (3-4 phrases minimum par cheval) avec sa musique
3. Un classement Top 5 logique basé sur les scores de forme réels
4. Des sélections cohérentes : Gagnant, Couplé, Quarté, Quinté si applicable, 2sur4 si 10+ partants
5. Des rapports de gains estimés réalistes

RÈGLES ABSOLUES :
- Le favori = cheval avec le score de forme le plus élevé (ou cote la plus basse si musique indisponible)
- Top5 trié par score de forme décroissant (ou cote croissante si musique indisponible)
- Cohérence totale entre favori, top5 et sélections
- Jamais de classement 1,2,3,4,5,6 séquentiel
- Jamais mentionner PMU, Equidia ou tout autre site
- Toujours écrire le texte dans la langue choisie par l'utilisateur`;

    const userPrompt = `Course: ${nomCourse}
Hippodrome: ${hippo} | Distance: ${course.dist || '?'} | Type: ${course.type || ''} | Terrain: ${terrain}
Partants actifs: ${n}
Langue de réponse: ${langue}

DONNÉES DES PARTANTS:
${horsesData}

IMPORTANT : Le champ de présentation doit s'appeler EXACTEMENT 'texte' (pas 'presentation', pas 'description', pas 'analyse'). Le champ 'texte' doit contenir un paragraphe de 5-8 lignes minimum analysant la course avec les musiques réelles des chevaux.

Réponds UNIQUEMENT en JSON valide (numéros disponibles: ${sorted.map(p => p.numero).join(', ')}):
{
  "texte": "Présentation de '${nomCourse}' à ${hippo}. Commence par le favori: 'N°${favoriNum} ${favori.nom} avec ${favori.driver || '?'} : ${favoriFormeStr}...'. Mentionne les outsiders dangereux${outsiders ? ' (notamment ' + outsiders + ')' : ''}. Impact du terrain ${terrain} sur les chances. 5-8 lignes en ${langue}.",
  "favori": ${favoriNum},
  "top5": [${sorted.slice(0, 5).map(p => p.numero).join(', ')}],
  "analyses": {
${analysesLines}
  },
  "gagnant": ${favoriNum},
  "couple": [${sorted[0]?.numero || 0}, ${sorted[1]?.numero || 0}],
${quinteBlock}  "rapports": {
${rapportItems.join(',\n')}
  }
}`;

    console.log('ai.js — course:', nomCourse, '| partants:', n, '| isQuinte:', isQuinte, '| langue:', langue);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: AbortSignal.timeout(55000)
    });

    const text = await resp.text();
    console.log('ANTHROPIC STATUS:', resp.status, 'RESPONSE:', text.substring(0, 300));
    try { return res.status(resp.status).json(JSON.parse(text)); }
    catch (e) { return res.status(500).json({ error: 'bad json', raw: text.substring(0, 200) }); }

  } catch (e) {
    console.log('ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
