// app.js
(() => {
  const CFG = window.APP_CONFIG || {};

  // ===== Helpers =====
  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function cleanStr(s){ return String(s ?? "").trim(); }

  // CSV parser (jednoduchý + zvládá uvozovky)
  function parseCSV(text){
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for(let i=0;i<text.length;i++){
      const c = text[i];

      if(c === '"'){
        // "" uvnitř uvozovek = escape "
        if(inQuotes && text[i+1] === '"'){ cur += '"'; i++; }
        else inQuotes = !inQuotes;
        continue;
      }

      if(!inQuotes && (c === ",")){
        row.push(cur);
        cur = "";
        continue;
      }

      if(!inQuotes && (c === "\n")){
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        continue;
      }

      if(c !== "\r") cur += c;
    }

    // poslední buňka
    row.push(cur);
    rows.push(row);

    // odstranění prázdných řádků na konci
    while(rows.length && rows[rows.length-1].every(x => String(x).trim() === "")) rows.pop();

    return rows;
  }

  function csvToObjects(csvText){
    const rows = parseCSV(csvText);
    if(!rows.length) return [];
    const header = rows[0].map(h => cleanStr(h));
    const out = [];

    for(let i=1;i<rows.length;i++){
      const r = rows[i];
      const obj = {};
      header.forEach((h, idx) => obj[h] = r[idx] ?? "");
      out.push(obj);
    }
    return out;
  }

  function toNum(x){
    const n = Number(String(x ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // ===== Footer year =====
  const y = document.getElementById("y");
  if (y) y.textContent = new Date().getFullYear();

  // ===== HERO SLIDESHOW =====
  (function heroSlideshow(){
    const imgEl = document.getElementById('heroMachine');
    if(!imgEl) return;

    const frames = [
      './assets/linka.png',
      './assets/centrifuga.png',
      './assets/susicka.png',
      './assets/vysavac.png',
      './assets/klepac.png'
    ];

    frames.forEach(src => { const i = new Image(); i.src = src; });

    let i = 0;
    const stepMs = 3000;
    const fadeMs = 350;

    setInterval(() => {
      imgEl.classList.add('isFading');
      setTimeout(() => {
        i = (i + 1) % frames.length;
        imgEl.src = frames[i];
        imgEl.classList.remove('isFading');
      }, fadeMs);
    }, stepMs);
  })();

  // ===== FORM (Formspree) =====
  const form = document.getElementById('inquiryForm');
  const formStatus = document.getElementById('formStatus');
  const sendBtn = document.getElementById('sendBtn');

  if(form){
    const action = cleanStr(CFG.FORMSPREE_ACTION);
    if(action) form.setAttribute('action', action);

    form.addEventListener('submit', async (e) => {
      const actionUrl = cleanStr(form.getAttribute('action'));

      if(!actionUrl || actionUrl.includes('YOUR_FORM_ID')){
        e.preventDefault();
        if(formStatus){
          formStatus.textContent = 'Nejdřív doplň Formspree URL v config.js (FORMSPREE_ACTION).';
          formStatus.style.color = 'rgba(220,38,38,.95)';
        }
        return;
      }

      e.preventDefault();
      if(formStatus){
        formStatus.textContent = 'Odesílám…';
        formStatus.style.color = 'inherit';
      }
      if(sendBtn) sendBtn.disabled = true;

      try{
        const fd = new FormData(form);
        const res = await fetch(actionUrl, {
          method: 'POST',
          body: fd,
          headers: { 'Accept': 'application/json' }
        });

        if(res.ok){
          form.reset();
          if(formStatus){
            formStatus.textContent = 'Hotovo. Poptávka byla odeslána.';
            formStatus.style.color = 'rgba(22,163,74,.95)';
          }
        }else{
          if(formStatus){
            formStatus.textContent = 'Nepovedlo se odeslat. Zkuste to znovu nebo napište na email.';
            formStatus.style.color = 'rgba(220,38,38,.95)';
          }
        }
      }catch(err){
        if(formStatus){
          formStatus.textContent = 'Chyba připojení. Zkuste to znovu nebo napište na email.';
          formStatus.style.color = 'rgba(220,38,38,.95)';
        }
      }finally{
        if(sendBtn) sendBtn.disabled = false;
      }
    });
  }

  // ====== CALC (AUTO + MULTI) ======
  const PRICE_CLEAN_PER_M2 = CFG.PRICE_CLEAN_PER_M2 ?? 300;
  const PRICE_EDGE_PER_M    = CFG.PRICE_EDGE_PER_M ?? 99;
  const PRICE_IMP_PER_M2    = CFG.PRICE_IMP_PER_M2 ?? 40;

  const rugsEl = document.getElementById('rugs');
  const addRugBtn = document.getElementById('addRugBtn');
  const resetRugsBtn = document.getElementById('resetRugsBtn');

  const sumAreaEl = document.getElementById('sumArea');
  const sumPerimEl = document.getElementById('sumPerim');
  const sumTotalEl = document.getElementById('sumTotal');
  const sumBreakdownEl = document.getElementById('sumBreakdown');

  function round2(n){ return Math.round(n * 100) / 100; }
  function czk(n){ return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n); }
  function numOk(x){ return Number.isFinite(x) && x > 0; }

  function ellipsePerimeter(aSemi_m, bSemi_m){
    const a = aSemi_m, b = bSemi_m;
    return Math.PI * (3*(a+b) - Math.sqrt((3*a + b)*(a + 3*b)));
  }

  function tplRugRow(idx){
    return `
      <div class="rugRow" data-idx="${idx}">
        <div class="rugTop">
          <div class="rugTitle">Koberec #${idx+1}</div>
          <button class="smallBtn" type="button" data-action="remove">Odebrat</button>
        </div>

        <div class="rugGrid">
          <div>
            <label>Tvar</label>
            <select data-field="shape">
              <option value="rect">Obdélník / čtverec</option>
              <option value="circle">Kruh</option>
              <option value="oval">Ovál (elipsa)</option>
            </select>
          </div>

          <div data-box="rect">
            <label>Šířka (cm)</label>
            <input type="number" min="0" step="0.1" placeholder="např. 160" data-field="w">
          </div>
          <div data-box="rect">
            <label>Délka (cm)</label>
            <input type="number" min="0" step="0.1" placeholder="např. 230" data-field="h">
          </div>

          <div data-box="circle" style="display:none;">
            <label>Průměr (cm)</label>
            <input type="number" min="0" step="0.1" placeholder="např. 200" data-field="d">
          </div>
          <div data-box="circle" style="display:none;">
            <label>&nbsp;</label>
            <div class="mini">Plocha = π × (d/2)²</div>
          </div>

          <div data-box="oval" style="display:none;">
            <label>Hlavní osa (cm)</label>
            <input type="number" min="0" step="0.1" placeholder="např. 240" data-field="a">
          </div>
          <div data-box="oval" style="display:none;">
            <label>Vedlejší osa (cm)</label>
            <input type="number" min="0" step="0.1" placeholder="např. 160" data-field="b">
          </div>
        </div>

        <div class="rugOpts">
          <label style="display:flex; gap:10px; align-items:center; margin:0;">
            <input type="checkbox" style="width:auto; transform: translateY(1px);" data-field="edge">
            <span>Obšívání (${PRICE_EDGE_PER_M} Kč / m)</span>
          </label>
          <label style="display:flex; gap:10px; align-items:center; margin:0;">
            <input type="checkbox" style="width:auto; transform: translateY(1px);" data-field="imp">
            <span>Impregnace (${PRICE_IMP_PER_M2} Kč / m²)</span>
          </label>
        </div>

        <div class="rugOut">
          <div class="boxy">
            <div class="mini">Plocha</div>
            <div class="val" data-out="area">— m²</div>
          </div>
          <div class="boxy">
            <div class="mini">Obvod</div>
            <div class="val" data-out="perim">— m</div>
          </div>
          <div class="boxy">
            <div class="mini">Cena (orientačně)</div>
            <div class="val" data-out="total">— Kč</div>
            <div class="mini" data-out="break" style="margin-top:6px;">Vyplň rozměry</div>
          </div>
        </div>
      </div>
    `;
  }

  function updateRowNumbering(){
    const rows = [...rugsEl.querySelectorAll('.rugRow')];
    rows.forEach((row, i) => {
      row.dataset.idx = String(i);
      row.querySelector('.rugTitle').textContent = `Koberec #${i+1}`;
    });
  }

  function showShapeBoxes(row, shape){
    row.querySelectorAll('[data-box="rect"]').forEach(el => el.style.display = (shape === 'rect') ? '' : 'none');
    row.querySelectorAll('[data-box="circle"]').forEach(el => el.style.display = (shape === 'circle') ? '' : 'none');
    row.querySelectorAll('[data-box="oval"]').forEach(el => el.style.display = (shape === 'oval') ? '' : 'none');
  }

  function getField(row, name){
    const el = row.querySelector(`[data-field="${name}"]`);
    if(!el) return null;
    if(el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function computeRow(row){
    const shape = getField(row, 'shape');

    let areaM2 = 0;
    let perimM = 0;
    let valid = true;

    if(shape === 'rect'){
      const w = parseFloat(getField(row, 'w'));
      const h = parseFloat(getField(row, 'h'));
      if(!numOk(w) || !numOk(h)) valid = false;
      if(valid){
        const w_m = w/100;
        const h_m = h/100;
        areaM2 = w_m * h_m;
        perimM = 2 * (w_m + h_m);
      }
    }

    if(shape === 'circle'){
      const d = parseFloat(getField(row, 'd'));
      if(!numOk(d)) valid = false;
      if(valid){
        const r_m = (d/100)/2;
        areaM2 = Math.PI * r_m * r_m;
        perimM = Math.PI * (d/100);
      }
    }

    if(shape === 'oval'){
      const a = parseFloat(getField(row, 'a'));
      const b = parseFloat(getField(row, 'b'));
      if(!numOk(a) || !numOk(b)) valid = false;
      if(valid){
        const aSemi_m = (a/100)/2;
        const bSemi_m = (b/100)/2;
        areaM2 = Math.PI * aSemi_m * bSemi_m;
        perimM = ellipsePerimeter(aSemi_m, bSemi_m);
      }
    }

    if(!valid){
      return { valid:false, areaM2:0, perimM:0, cleanCost:0, edgeCost:0, impCost:0, total:0 };
    }

    areaM2 = round2(areaM2);
    perimM = round2(perimM);

    const edge = !!getField(row, 'edge');
    const imp = !!getField(row, 'imp');

    const cleanCost = Math.round(areaM2 * PRICE_CLEAN_PER_M2);
    const edgeCost  = edge ? Math.round(perimM * PRICE_EDGE_PER_M) : 0;
    const impCost   = imp  ? Math.round(areaM2 * PRICE_IMP_PER_M2) : 0;

    const total = cleanCost + edgeCost + impCost;
    return { valid:true, areaM2, perimM, cleanCost, edgeCost, impCost, total };
  }

  function renderRowOutputs(row, r){
    const areaEl = row.querySelector('[data-out="area"]');
    const perEl = row.querySelector('[data-out="perim"]');
    const totEl = row.querySelector('[data-out="total"]');
    const brEl = row.querySelector('[data-out="break"]');

    if(!r.valid){
      areaEl.textContent = '— m²';
      perEl.textContent = '— m';
      totEl.textContent = '— Kč';
      brEl.textContent = 'Vyplň rozměry';
      return;
    }

    areaEl.textContent = `${r.areaM2} m²`;
    perEl.textContent = `${r.perimM} m`;
    totEl.textContent = `${czk(r.total)} Kč`;

    brEl.innerHTML = [
      `Čištění: ${czk(r.cleanCost)} Kč`,
      `Obšívání: ${czk(r.edgeCost)} Kč`,
      `Impregnace: ${czk(r.impCost)} Kč`,
    ].join('<br>');
  }

  function computeAll(){
    const rows = [...rugsEl.querySelectorAll('.rugRow')];

    let sumArea = 0, sumPer = 0, sumClean = 0, sumEdge = 0, sumImp = 0, sumTotal = 0;

    rows.forEach(row => {
      const shape = getField(row, 'shape');
      showShapeBoxes(row, shape);

      const r = computeRow(row);
      renderRowOutputs(row, r);

      if(r.valid){
        sumArea += r.areaM2;
        sumPer += r.perimM;
        sumClean += r.cleanCost;
        sumEdge += r.edgeCost;
        sumImp += r.impCost;
        sumTotal += r.total;
      }
    });

    sumArea = round2(sumArea);
    sumPer  = round2(sumPer);

    sumAreaEl.textContent = rows.length ? `${sumArea} m²` : '— m²';
    sumPerimEl.textContent = rows.length ? `${sumPer} m` : '— m';
    sumTotalEl.textContent = rows.length ? `${czk(sumTotal)} Kč` : '— Kč';

    if(!rows.length){
      sumBreakdownEl.textContent = '—';
      return;
    }

    sumBreakdownEl.innerHTML = [
      `Čištění: ${czk(sumClean)} Kč`,
      `Obšívání: ${czk(sumEdge)} Kč`,
      `Impregnace: ${czk(sumImp)} Kč`,
    ].join('<br>');
  }

  function debounce(fn, wait){
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }
  const computeAllDebounced = debounce(computeAll, 80);

  function addRug(){
    const idx = rugsEl.querySelectorAll('.rugRow').length;
    rugsEl.insertAdjacentHTML('beforeend', tplRugRow(idx));
    computeAll();
  }

  function resetRugs(){
    rugsEl.innerHTML = '';
    addRug();
  }

  if (rugsEl){
    rugsEl.addEventListener('input', (e) => {
      const t = e.target;
      if(t && t.matches('input, select')){
        computeAllDebounced();
      }
    });
    rugsEl.addEventListener('change', () => computeAll());
    rugsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remove"]');
      if(!btn) return;
      const row = btn.closest('.rugRow');
      if(!row) return;
      row.remove();
      updateRowNumbering();
      computeAll();
    });
  }

  addRugBtn?.addEventListener('click', addRug);
  resetRugsBtn?.addEventListener('click', resetRugs);
  if (rugsEl) resetRugs();

  // ====== PLACES: load from Google Sheets CSV and render list ======
  const placesListEl = document.getElementById('placesList');
  const mapStatusEl
