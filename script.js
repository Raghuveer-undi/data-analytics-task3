/* dashboard.js
   Single-file JavaScript dashboard injector.
   Usage: include this file in any HTML page:
     <script src="dashboard.js"></script>
   The script will:
   - load PapaParse, JSZip, Chart.js dynamically
   - create UI (upload, controls, KPIs, charts, table)
   - parse CSV or ZIP containing CSV
   - auto-detect columns and provide slicers/filters
   - render charts and KPI cards
*/

(function globalDashboard(){
  // Config: CDN URLs for libraries
  const CDN = {
    papaparse: "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js",
    jszip:    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    chart:    "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
  };

  // Utility: dynamically load a script and return a Promise
  function loadScript(url){
    return new Promise((resolve, reject)=>{
      if(document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = url;
      s.onload = ()=>resolve();
      s.onerror = (e)=>reject(new Error('Failed to load ' + url));
      document.head.appendChild(s);
    });
  }

  // Ensure required libs loaded in sequence
  async function ensureLibs(){
    await loadScript(CDN.papaparse);
    await loadScript(CDN.jszip);
    await loadScript(CDN.chart);
  }

  // Basic CSS injected for nice look
  const styleCss = `
  :root{--bg:#071028;--card:#0b1220;--muted:#94a3b8;--accent:#0ea5e9;--growth:#10b981;--decline:#ef4444}
  .db-wrap{font-family:Inter,system-ui,Segoe UI,Roboto,Arial;background:var(--bg);color:#e6eef6;padding:18px;min-height:80vh}
  .db-header{display:flex;justify-content:space-between;align-items:center;gap:12px}
  .db-logo{display:flex;gap:12px;align-items:center}
  .db-logo-box{width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;color:#021325;font-weight:800}
  .db-title{font-size:18px;font-weight:700}
  .db-sub{color:var(--muted);font-size:13px}
  .db-nav{display:flex;gap:8px}
  .db-nav button{background:transparent;border:none;color:var(--muted);padding:8px 12px;border-radius:8px;cursor:pointer}
  .db-nav button.active{background:rgba(255,255,255,0.03);color:var(--accent)}
  .db-card{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:12px;border-radius:12px;margin-top:12px;box-shadow:0 6px 18px rgba(2,6,23,0.6)}
  .db-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
  .db-btn{background:var(--accent);color:#021325;padding:8px 12px;border-radius:10px;border:none;cursor:pointer;font-weight:700}
  .db-btn.secondary{background:transparent;border:1px solid rgba(255,255,255,0.06);color:var(--muted)}
  .db-kpi-row{display:flex;gap:12px;margin-top:12px;flex-wrap:wrap}
  .db-kpi{flex:1;min-width:160px;padding:12px;border-radius:10px;background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))}
  .db-kpi .label{color:var(--muted);font-size:13px}
  .db-kpi .value{font-size:20px;font-weight:800;margin-top:6px}
  .db-kpi .delta{font-size:13px;margin-top:6px}
  .db-grid{display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:12px}
  .db-table{width:100%;border-collapse:collapse;color:#d7e7ff}
  .db-table th, .db-table td{padding:8px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:left}
  .db-table th{color:var(--muted);font-size:13px}
  .db-footer{color:var(--muted);font-size:12px;margin-top:12px}
  .db-go-top{position:fixed;right:18px;bottom:18px;background:var(--accent);color:#021325;padding:12px;border-radius:999px;border:none;cursor:pointer}
  @media (max-width:900px){ .db-grid{grid-template-columns:1fr} .db-kpi-row{flex-direction:column} }
  `;

  // Helper: create element with attrs
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    for(const k in attrs){
      if(k === 'class') e.className = attrs[k];
      else if(k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children)?children:[children]).forEach(c=>{
      if(c==null) return;
      if(typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  // Formatting utility
  const fmtINR = n => (typeof n === 'number' && isFinite(n)) ? '₹' + Math.round(n).toLocaleString('en-IN') : '—';
  const parseNum = v => {
    if(v===null || v===undefined) return NaN;
    const s = String(v).replace(/[₹,\\s]/g,'').trim();
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  };

  // Main UI builder & logic
  async function build(){
    await ensureLibs();

    // inject styles
    const styleTag = document.createElement('style');
    styleTag.innerText = styleCss;
    document.head.appendChild(styleTag);

    // root container appended to body
    const root = el('div',{class:'db-wrap', id:'db_root'});
    document.body.prepend(root);

    // header
    const logoBox = el('div',{class:'db-logo-box'}, 'DB');
    const title = el('div',{}, [el('div',{class:'db-title'}, 'Interactive Dashboard (JS)'), el('div',{class:'db-sub'}, 'Upload CSV or ZIP → KPIs • Filters • Time-series')]);
    const brand = el('div',{class:'db-logo'}, [logoBox, title]);

    // nav
    const nav = el('div',{class:'db-nav'});
    ['Overview','Sales','Customers','Products'].forEach((n,i)=>{
      const btn = el('button',{type:'button'}, n);
      btn.dataset.view = n.toLowerCase();
      if(i===0) btn.classList.add('active');
      btn.addEventListener('click', ()=> switchView(btn.dataset.view, nav));
      nav.appendChild(btn);
    });

    // uploader and download
    const fileInput = el('input',{type:'file', accept:'.csv,.zip', style:'display:none'});
    const uploadBtn = el('button',{class:'db-btn'}, 'Upload CSV / ZIP');
    uploadBtn.addEventListener('click', ()=> fileInput.click());
    const downloadBtn = el('a',{class:'db-btn secondary', style:'display:none', href:'#', download:'cleaned_data.csv'}, 'Download CSV');

    fileInput.addEventListener('change', (ev)=> handleFile(ev.target.files[0]));

    const headerRow = el('div',{class:'db-header'}, [brand, el('div',{}, [nav, el('div',{style:'display:flex;gap:8px;margin-top:8px'}, [uploadBtn, downloadBtn]), fileInput])]);
    root.appendChild(headerRow);

    // controls card
    const controlsCard = el('div',{class:'db-card'}, []);
    const controlsRow = el('div',{class:'db-controls'});
    const hint = el('div',{class:'db-sub'}, 'Choose right KPIs (Sales, Profit, Growth). Use slicers/filters, time-series, and KPI cards.');
    // select elements
    const createSelect = (placeholder)=> el('select',{class:'db-select'}, el('option',{}, placeholder));
    const salesSel = createSelect('Sales / Revenue (auto)');
    const costSel = createSelect('Cost / Expense (auto)');
    const profitSel = createSelect('Profit (optional)');
    const dateSel = createSelect('Date column (auto)');
    const regionSel = createSelect('Region / Segment');
    const productSel = createSelect('Product / Category');

    const renderBtn = el('button',{class:'db-btn'}, 'Render');
    renderBtn.addEventListener('click', ()=> renderAll());
    const resetBtn = el('button',{class:'db-btn secondary'}, 'Reset');
    resetBtn.addEventListener('click', ()=> location.reload());

    controlsRow.appendChild(salesSel);
    controlsRow.appendChild(costSel);
    controlsRow.appendChild(profitSel);
    controlsRow.appendChild(dateSel);
    controlsRow.appendChild(regionSel);
    controlsRow.appendChild(productSel);
    controlsRow.appendChild(renderBtn);
    controlsRow.appendChild(resetBtn);
    controlsCard.appendChild(controlsRow);
    controlsCard.appendChild(hint);
    root.appendChild(controlsCard);

    // slicers card (date range + region/product filters)
    const slicersCard = el('div',{class:'db-card', id:'db_slicers', style:'display:none'}, []);
    const dateFrom = el('input',{type:'date'});
    const dateTo = el('input',{type:'date'});
    const filterRegion = el('select',{}, el('option',{}, 'All Regions'));
    const filterProduct = el('select',{}, el('option',{}, 'All Products'));
    const applyFilters = el('button',{class:'db-btn'}, 'Apply Filters');
    const clearFilters = el('button',{class:'db-btn secondary'}, 'Clear Filters');
    applyFilters.addEventListener('click', ()=> renderAll());
    clearFilters.addEventListener('click', ()=> { dateFrom.value=''; dateTo.value=''; filterRegion.value='All'; filterProduct.value='All'; renderAll(); });
    slicersCard.appendChild(el('div',{}, ['Date from: ', dateFrom, ' to ', dateTo, '  ', filterRegion, filterProduct, applyFilters, clearFilters]));
    root.appendChild(slicersCard);

    // KPI row
    const kpiRow = el('div',{class:'db-kpi-row'});
    const kRevenue = kpiCard('Total Revenue'); const kProfit = kpiCard('Total Profit'); const kOrders = kpiCard('Orders'); const kAOV = kpiCard('Avg Order Value');
    kpiRow.appendChild(kRevenue.card); kpiRow.appendChild(kProfit.card); kpiRow.appendChild(kOrders.card); kpiRow.appendChild(kAOV.card);
    root.appendChild(kpiRow);

    // main grid with charts and table
    const grid = el('div',{class:'db-grid'});
    // left big column
    const leftCol = el('div',{});
    const timeCard = el('div',{class:'db-card'}, [el('div',{}, el('strong',{}, 'Revenue & Orders Over Time')), el('canvas',{id:'timeChart', height:160})]);
    const productsCard = el('div',{class:'db-card'}, [el('div',{}, el('strong',{}, 'Top Products')), el('canvas',{id:'prodChart', height:180})]);
    leftCol.appendChild(timeCard); leftCol.appendChild(productsCard);

    // right column
    const rightCol = el('div',{});
    const corrCard = el('div',{class:'db-card'}, [el('div',{}, el('strong',{}, 'Top Correlations vs Sales')), el('canvas',{id:'corrChart', height:220})]);
    const tableCard = el('div',{class:'db-card'}, [el('div',{}, el('strong',{}, 'Transactions (sample)')), el('div',{style:'max-height:260px;overflow:auto;margin-top:8px'}, el('table',{class:'db-table', id:'sampleTable'}, [el('thead',{}), el('tbody',{})]))]);
    rightCol.appendChild(corrCard); rightCol.appendChild(tableCard);

    grid.appendChild(leftCol); grid.appendChild(rightCol);
    root.appendChild(grid);

    // footer and go-top
    const footer = el('div',{class:'db-footer'}, 'Built with JS • Upload CSV or ZIP and click Render');
    root.appendChild(footer);
    const goTop = el('button',{class:'db-go-top', title:'Go to top'}, '⬆');
    goTop.addEventListener('click', ()=> window.scrollTo({top:0, behavior:'smooth'}));
    document.body.appendChild(goTop);

    // Data container and chart references
    let master = { cols: [], rows: [] };
    let charts = {};

    // Build default UI population functions
    function kpiCard(name){
      const card = el('div',{class:'db-kpi'});
      const label = el('div',{class:'label'}, name);
      const value = el('div',{class:'value'}, '—');
      const delta = el('div',{class:'delta'}, '—');
      card.appendChild(label); card.appendChild(value); card.appendChild(delta);
      return {card, set: (v, d)=>{ value.textContent = v; delta.textContent = d; } };
    }

    // switch view helper
    function switchView(view, navEl){
      navEl.querySelectorAll('button').forEach(b=> b.classList.toggle('active', b.dataset.view === view));
      // for this self-contained version we keep same content and just update footer text to show view
      footer.textContent = 'View: ' + view.toUpperCase() + ' — Built with JS';
      window.scrollTo({top:0, behavior:'smooth'});
    }

    // handle file (CSV or ZIP) : uses PapaParse & JSZip
    async function handleFile(file){
      if(!file) return;
      // reset
      master = { cols: [], rows: [] };
      // read as text or zip
      if(file.name.toLowerCase().endsWith('.zip')){
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        let csvName = null;
        zip.forEach((path, f)=>{ if(!csvName && path.toLowerCase().endsWith('.csv')) csvName = path; });
        if(!csvName){ alert('No CSV found inside ZIP'); return; }
        const text = await zip.file(csvName).async('string');
        parseCSVText(text, file.name);
      } else {
        const text = await file.text();
        parseCSVText(text, file.name);
      }
    }

    // parse CSV text with PapaParse
    function parseCSVText(txt, sourceName){
      const parsed = Papa.parse(txt, { header:true, skipEmptyLines:true });
      if(parsed.errors && parsed.errors.length){
        console.warn('CSV parse warnings:', parsed.errors.slice(0,5));
      }
      const rawFields = parsed.meta.fields || [];
      const cleanedFields = rawFields.map(c=> cleanName(c));
      // map rows to cleaned fields
      const rows = parsed.data.map(r=>{
        const o = {};
        rawFields.forEach((rf,i)=> o[cleanedFields[i]] = r[rf]);
        return o;
      });
      master.cols = cleanedFields; master.rows = rows;
      populateSelectors();
      renderSample();
      slicersCard.style.display = 'block';
      // create downloadable cleaned CSV
      const cleanCsv = Papa.unparse(rows);
      const blob = new Blob([cleanCsv], {type:'text/csv'});
      downloadBtn.href = URL.createObjectURL(blob);
      downloadBtn.style.display = 'inline-block';
    }

    // sanitize column name into JS-friendly
    function cleanName(s){
      return String(s||'').trim().replace(/\s+/g,'_').replace(/[\/%()]/g,'').slice(0,60);
    }

    // populate all select controls with columns
    function populateSelectors(){
      const allSelects = [salesSel, costSel, profitSel, dateSel, regionSel, productSel];
      allSelects.forEach(sel => {
        sel.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = sel.firstChild ? sel.firstChild.textContent : 'Select';
        sel.appendChild(placeholder);
      });
      master.cols.forEach(c=>{
        const opt = document.createElement('option'); opt.value = c; opt.textContent = c;
        allSelects.forEach(s=> s.appendChild(opt.cloneNode(true)));
      });
      // auto-detect candidates
      for(const c of master.cols){
        const lc = c.toLowerCase();
        if(!salesSel.value && /revenue|sales|amount|total|price|turnover/.test(lc)) salesSel.value = c;
        if(!costSel.value && /cost|expense|cogs|costs/.test(lc)) costSel.value = c;
        if(!profitSel.value && /profit|margin/.test(lc)) profitSel.value = c;
        if(!dateSel.value && /date|day|dt|timestamp/.test(lc)) dateSel.value = c;
        if(!regionSel.value && /region|state|area|zone|city|location/.test(lc)) regionSel.value = c;
        if(!productSel.value && /product|item|sku|category|cat/.test(lc)) productSel.value = c;
      }
      // if no date found by pattern, try heuristic on sample content
      if(!dateSel.value){
        for(const c of master.cols){
          const sample = master.rows.slice(0,200).map(r=>r[c]);
          if(isDateCandidate(sample)){ dateSel.value = c; break; }
        }
      }
    }

    // heuristic: is majority of sample parseable as date?
    function isDateCandidate(sample){
      let ok=0, tot=0;
      for(let i=0;i<Math.min(sample.length,200);i++){
        const v = sample[i]; if(v==null) continue; tot++;
        const parsed = Date.parse(String(v));
        if(!isNaN(parsed)) ok++;
      }
      return tot>0 && (ok/tot) > 0.6;
    }

    // render sample into table
    function renderSample(limit=50){
      const thead = root.querySelector('#sampleTable thead');
      const tbody = root.querySelector('#sampleTable tbody');
      thead.innerHTML = ''; tbody.innerHTML = '';
      const rows = master.rows.slice(0,limit);
      if(rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      const trh = document.createElement('tr'); cols.forEach(c=> { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); }); thead.appendChild(trh);
      rows.forEach(r=>{
        const tr = document.createElement('tr');
        cols.forEach(c=> { const td = document.createElement('td'); td.textContent = r[c] === undefined || r[c] === null ? '' : String(r[c]); tr.appendChild(td); });
        tbody.appendChild(tr);
      });
    }

    // clear charts
    function clearCharts(){
      for(const k in charts) try{ charts[k].destroy(); } catch(e) {}
      charts = {};
    }

    // compute Pearson correlation (paired arrays)
    function pearson(a, b){
      if(a.length !== b.length || a.length === 0) return 0;
      const n = a.length;
      const meanA = a.reduce((s,x)=>s+x,0)/n;
      const meanB = b.reduce((s,x)=>s+x,0)/n;
      let num=0, a2=0, b2=0;
      for(let i=0;i<n;i++){ const da=a[i]-meanA, db=b[i]-meanB; num += da*db; a2 += da*da; b2 += db*db; }
      return num / Math.sqrt((a2*b2) || 1);
    }

    // main render: apply filters, compute KPIs, charts
    function renderAll(){
      clearCharts();
      const salesCol = salesSel.value || null;
      const costCol = costSel.value || null;
      const profitCol = profitSel.value || null;
      const dateCol = dateSel.value || null;
      const regionCol = regionSel.value || null;
      const productCol = productSel.value || null;

      // show slicers card if we have data
      if(master.rows.length) slicersCard.style.display = 'block';

      // apply slicers
      const selRegion = slicersCard.querySelector('select') ? slicersCard.querySelector('select').value : 'All';
      // but we have dedicated filterRegion and filterProduct in our DOM, find them
      const regionFilter = slicersCard.querySelector('select') || null;

      // read date range inputs
      const dateFrom = slicersCard.querySelector('input[type=date]') ? slicersCard.querySelector('input[type=date]').value : '';
      const dateTo = slicersCard.querySelectorAll('input[type=date]')[1] ? slicersCard.querySelectorAll('input[type=date]')[1].value : '';

      // For simplicity use the previously created dateFrom/dateTo/filterRegion/filterProduct elements
      const dateFromEl = slicersCard.querySelector('input[type=date]');
      const dateToEl = slicersCard.querySelectorAll('input[type=date]')[1];
      const filterRegionEl = slicersCard.querySelectorAll('select')[0];
      const filterProductEl = slicersCard.querySelectorAll('select')[1];
      const selRegionVal = filterRegionEl ? filterRegionEl.value : 'All';
      const selProductVal = filterProductEl ? filterProductEl.value : 'All';

      // Filter rows
      let rows = master.rows.slice();
      if(dateCol && (dateFromEl.value || dateToEl.value)){
        const from = dateFromEl.value ? new Date(dateFromEl.value) : null;
        const to   = dateToEl.value ? new Date(dateToEl.value) : null;
        rows = rows.filter(r=>{
          const d = Date.parse(String(r[dateCol])); if(isNaN(d)) return false;
          const dt = new Date(d);
          if(from && dt < from) return false; if(to && dt > to) return false; return true;
        });
      }
      if(regionCol && selRegionVal && selRegionVal !== 'All'){
        rows = rows.filter(r => String(r[regionCol]) === selRegionVal);
      }
      if(productCol && selProductVal && selProductVal !== 'All'){
        rows = rows.filter(r => String(r[productCol]) === selProductVal);
      }

      // KPIs
      const revenue = salesCol ? rows.reduce((s,r)=> s + (isFinite(parseNum(r[salesCol]))? parseNum(r[salesCol]) : 0), 0) : NaN;
      let profit = NaN;
      if(profitCol) profit = rows.reduce((s,r)=> s + (isFinite(parseNum(r[profitCol]))? parseNum(r[profitCol]) : 0), 0);
      else if(salesCol && costCol) profit = revenue - rows.reduce((s,r)=> s + (isFinite(parseNum(r[costCol]))? parseNum(r[costCol]) : 0), 0);

      const orders = rows.length;
      const aov = orders ? (revenue / orders) : NaN;

      // update KPI displays
      kRevenue.set(fmtINR(revenue), '');
      kProfit.set(fmtINR(profit), '');
      kOrders.set(String(orders), '');
      kAOV.set(fmtINR(aov), '');

      // growth delta: compare recent window to previous window if date present
      if(dateCol && master.rows.length){
        const allDates = master.rows.map(r=> Date.parse(String(r[dateCol]))).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
        if(allDates.length){
          const last = new Date(allDates[allDates.length-1]);
          const days = 30;
          const periodStart = new Date(last); periodStart.setDate(periodStart.getDate() - (days-1));
          const prevEnd = new Date(periodStart); prevEnd.setDate(prevEnd.getDate() - 1);
          const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days-1));
          const sumPeriod = master.rows.filter(r=>{ const d=Date.parse(String(r[dateCol])); return !isNaN(d) && d>=periodStart && d<=last; }).reduce((s,r)=> s + (salesCol? parseNum(r[salesCol])||0 : 0), 0);
          const sumPrev = master.rows.filter(r=>{ const d=Date.parse(String(r[dateCol])); return !isNaN(d) && d>=prevStart && d<=prevEnd; }).reduce((s,r)=> s + (salesCol? parseNum(r[salesCol])||0 : 0), 0);
          let pct = '—';
          if(sumPrev > 0) { const p = Math.round(((sumPeriod - sumPrev) / sumPrev) * 100); pct = (p>=0? '▲ ':'▼ ') + Math.abs(p) + '%'; }
          kRevenue.set(fmtINR(revenue), pct);
        }
      }

      // Time-series chart: aggregate by day
      if(dateCol){
        const byDay = {};
        rows.forEach(r=>{
          const d = Date.parse(String(r[dateCol])); if(isNaN(d)) return;
          const key = new Date(d).toISOString().slice(0,10);
          byDay[key] = byDay[key] || {rev:0,orders:0};
          byDay[key].rev += salesCol ? (isFinite(parseNum(r[salesCol]))? parseNum(r[salesCol]) : 0) : 0;
          byDay[key].orders += 1;
        });
        const labels = Object.keys(byDay).sort((a,b)=> new Date(a)- new Date(b));
        const revSeries = labels.map(l=> byDay[l].rev);
        const ordSeries = labels.map(l=> byDay[l].orders);
        const ctx = document.getElementById('timeChart').getContext('2d');
        charts.time = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label:'Revenue', data: revSeries, borderWidth:2, tension:0.25 },
              { label:'Orders', data: ordSeries, type:'bar', barThickness:12 }
            ]
          },
          options: { responsive:true, plugins:{legend:{position:'top'}}, scales:{ y: { beginAtZero:true } } }
        });
      }

      // Top products
      if(productCol){
        const prodAgg = {};
        rows.forEach(r=>{
          const key = String(r[productCol] === undefined || r[productCol] === null ? 'Unknown' : r[productCol]);
          prodAgg[key] = (prodAgg[key]||0) + (salesCol? (isFinite(parseNum(r[salesCol]))? parseNum(r[salesCol]) : 0) : 0);
        });
        const sorted = Object.keys(prodAgg).sort((a,b)=> prodAgg[b] - prodAgg[a]).slice(0,12);
        const vals = sorted.map(k=> prodAgg[k]);
        const ctx = document.getElementById('prodChart').getContext('2d');
        charts.prod = new Chart(ctx, { type:'bar', data:{ labels: sorted, datasets: [{ label:'Revenue', data: vals, backgroundColor:'#7c3aed', borderRadius:6 }] }, options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}});
      }

      // Correlations vs sales (compute Pearson on numeric columns)
      if(salesCol){
        const candidateCols = master.cols.filter(c=> c !== salesCol ).slice(0,50);
        const corrs = [];
        candidateCols.forEach(col=>{
          const paired = [];
          for(const r of master.rows){
            const a = parseNum(r[salesCol]); const b = parseNum(r[col]);
            if(!isNaN(a) && !isNaN(b)) paired.push([a,b]);
          }
          if(paired.length < 10) return;
          const aArr = paired.map(p=>p[0]), bArr = paired.map(p=>p[1]);
          const val = pearson(aArr, bArr);
          corrs.push({col, val});
        });
        corrs.sort((x,y)=> Math.abs(y.val) - Math.abs(x.val));
        const top = corrs.slice(0,8);
        const labels = top.map(t=> t.col );
        const vals = top.map(t=> Math.abs(t.val));
        const ctx = document.getElementById('corrChart').getContext('2d');
        charts.corr = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ label:'|corr| vs Sales', data: vals, backgroundColor:'#58a6ff', borderRadius:6 }]}, options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, max:1}}}});
      }

      // populate slicer select options (region/product)
      if(regionCol){
        const options = Array.from(new Set(master.rows.map(r=> String(r[regionCol] || 'Unknown') ))).slice(0,200);
        const sel = slicersCard.querySelectorAll('select')[0];
        sel.innerHTML = ''; sel.appendChild(el('option',{}, 'All'));
        options.forEach(o=> sel.appendChild(el('option',{value:o}, o)));
      }
      if(productCol){
        const options = Array.from(new Set(master.rows.map(r=> String(r[productCol] || 'Unknown') ))).slice(0,200);
        const sel = slicersCard.querySelectorAll('select')[1];
        sel.innerHTML = ''; sel.appendChild(el('option',{}, 'All'));
        options.forEach(o=> sel.appendChild(el('option',{value:o}, o)));
      }

      // update sample table with filtered rows
      const sampleTable = document.getElementById('sampleTable');
      const thead = sampleTable.querySelector('thead'), tbody = sampleTable.querySelector('tbody');
      thead.innerHTML = ''; tbody.innerHTML = '';
      const show = rows.slice(0,200);
      if(show.length){
        const cols = Object.keys(show[0]);
        const headRow = document.createElement('tr');
        cols.forEach(c=> { const th = document.createElement('th'); th.textContent = c; headRow.appendChild(th); });
        thead.appendChild(headRow);
        show.forEach(r=> {
          const tr = document.createElement('tr');
          cols.forEach(c=> { const td = document.createElement('td'); td.textContent = r[c] === undefined || r[c] === null ? '' : String(r[c]); tr.appendChild(td); });
          tbody.appendChild(tr);
        });
      }
    }

    // expose a few globals for debugging (optional)
    window.__db = { master, renderAll };

    // helper: parseNum and fmt used in local scope
    function parseNum(v){ return parseNumLocal(v); } // placeholder to satisfy linter
    function parseNumLocal(v){ if(v===null||v===undefined) return NaN; const s = String(v).replace(/[₹,\\s]/g,'').trim(); const n = Number(s); return isFinite(n)? n : NaN; }
    function fmtINRLocal(n){ return (typeof n === 'number' && isFinite(n)) ? '₹' + Math.round(n).toLocaleString('en-IN') : '—'; }

    // attach kpi setters to closure variables
    function assignKPISetters(){
      // closure variables created earlier: kRevenue, kProfit, kOrders, kAOV
      kRevenue.set = (v,d)=> { kRevenue.card.querySelector('.value').textContent = v; kRevenue.card.querySelector('.delta').textContent = d || ''; };
      kProfit.set = (v,d)=> { kProfit.card.querySelector('.value').textContent = v; kProfit.card.querySelector('.delta').textContent = d || ''; };
      kOrders.set = (v,d)=> { kOrders.card.querySelector('.value').textContent = v; kOrders.card.querySelector('.delta').textContent = d || ''; };
      kAOV.set = (v,d)=> { kAOV.card.querySelector('.value').textContent = v; kAOV.card.querySelector('.delta').textContent = d || ''; };
    }
    // hacky attach because kRevenue etc were created before this function exists
    assignKPISetters();

    // small poly: we used parseNumLocal above; ensure top-level parseNum variable refers to it
    // (this is only for internal usage)
  }

  // run builder
  build().catch(err=>{
    console.error('Dashboard init failed:', err);
    const msg = document.createElement('div'); msg.style.padding='12px'; msg.style.background='#fee'; msg.textContent = 'Failed to load dashboard: ' + err.message;
    document.body.prepend(msg);
  });

})(); // end IIFE
