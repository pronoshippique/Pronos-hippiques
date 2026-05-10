export default {
  async fetch(request) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=600'
    };
    try {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2,'0');
      const mm = String(today.getMonth()+1).padStart(2,'0');
      const yyyy = today.getFullYear();
      const r = await fetch(
        `https://online.turfinfo.api.pmu.fr/rest/client/1/programme/${yyyy}${mm}${dd}?metier=INTERNET&fields=ALL`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pmu.fr/' } }
      );
      const d = await r.json();
      const reunions = (d.programme?.reunions||[]).slice(0,8).map((r,i)=>({
        id:`R${i+1}`,
        hippodrome:r.hippodrome?.nom||`R${i+1}`,
        courses:(r.courses||[]).slice(0,10).map((c,j)=>({
          id:`C${j+1}`,ref:`R${i+1} C${j+1}`,
          nom:c.libelle||`Course ${j+1}`,
          type:c.discipline||'Plat',
          dist:`${c.distance||1600}m`,
          part:c.nombreDeclaresPartants||10,
          heure:c.heureDepart?new Date(c.heureDepart).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'}).replace(':','h'):'--h--',
          terrain:c.conditionsPiste||'Bon',
          quinte:c.categorieStatut==='QUINTE_PLUS',
          partantsData:[]
        }))
      })).filter(r=>r.courses.length>0);
      return new Response(JSON.stringify({success:true,reunions}),{headers});
    } catch(e) {
      return new Response(JSON.stringify({success:false,error:e.message}),{headers});
    }
  }
};
