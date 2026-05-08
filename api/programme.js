export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  try {
    // API officielle France Galop / LeTrot
    const r = await fetch(
      `https://www.letrot.com/stats/api/programme?date=${yyyy}-${mm}-${dd}`,
      { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
    );
    const text = await r.text();
    res.json({ success: true, status: r.status, sample: text.substring(0,300) });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
}
