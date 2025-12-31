const LS = {
  apiKey: "cb_apiKey",
  fileId: "cb_fileId",
  trendFileId: "cb_trendFileId",
  watch: "cb_watchlist",
  cols: "cb_cols_visible",
  pins: "cb_cols_pinned",
  order: "cb_cols_order",          // ✅ 新增：欄位順序
  sortKey: "cb_sortKey",
  sortDir: "cb_sortDir",
};

const COLS = [
  { key:"bond_code", label:"債券代號(bond_code)" },
  { key:"bond_name", label:"債券名稱(bond_name)" },
  { key:"issuer_code", label:"發行機構代碼(issuer_code)" },
  { key:"issuer_name", label:"發行機構名稱(issuer_name)" },
  { key:"bond_trade_date", label:"CB交易日(bond_trade_date)" },
  { key:"cb_close", label:"CB收市價(cb_close)" },
  { key:"cb_change", label:"CB漲跌(cb_change)" },
  { key:"premium_pct", label:"轉換溢價率%(premium_pct)" },
  { key:"conv_value_100", label:"轉換價值(每百元)(conv_value_100)" },
  { key:"conv_price", label:"最新轉換價(conv_price)" },
  { key:"issuer_stock_close", label:"標的股收盤價(issuer_stock_close)" },
  { key:"issuer_stock_market", label:"標的市場(issuer_stock_market)" },

  { key:"cb_open", label:"CB開市價(cb_open)" },
  { key:"cb_high", label:"CB最高價(cb_high)" },
  { key:"cb_low", label:"CB最低價(cb_low)" },
  { key:"cb_units", label:"CB成交單位(cb_units)" },
  { key:"cb_amount", label:"CB成交金額(cb_amount)" },
  { key:"cb_trades", label:"CB成交筆數(cb_trades)" },
  { key:"cb_trade_mode", label:"CB交易模式(cb_trade_mode)" },

  { key:"listed_date", label:"掛牌日(listed_date)" },
  { key:"maturity", label:"到期日(maturity)" },
  { key:"next_put_date", label:"下一次賣回日(next_put_date)" },
  { key:"next_put_price_pct", label:"下一次賣回價%(next_put_price_pct)" },

  { key:"tdcc_yyyymm", label:"TDCC資料年月(tdcc_yyyymm)" },
  { key:"issued_amt", label:"發行張數(issued_amt)" },
  { key:"remaining_bonds", label:"剩餘張數(remaining_bonds)" },
  { key:"converted_bonds", label:"已轉換張數(converted_bonds)" },
  { key:"converted_ratio_pct", label:"已轉換比例%(converted_ratio_pct)" },
  { key:"converted_this_week", label:"本週轉換張數(converted_this_week)" },

  { key:"snapshot_date", label:"快照日期(snapshot_date)" },
];

const el = (id)=>document.getElementById(id);
const fmt = (v)=>{
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return (Math.round(v*1000)/1000).toLocaleString();
  }
  return String(v);
};

// 將非標準 JSON token（NaN / Infinity）在「非字串區段」轉成 null，避免 JSON.parse 失敗
function sanitizeNonStandardJSON(text){
  const isBoundary = (ch)=>{
    // JSON token 邊界：逗號/括號/冒號/空白等都算，字母數字底線不算
    return !ch || !(/[0-9A-Za-z_]/.test(ch));
  };

  let out = "";
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++){
    const ch = text[i];

    if (inStr){
      out += ch;
      if (esc) { esc = false; continue; }
      if (ch === "\\\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }

    if (ch === '"'){
      inStr = true;
      out += ch;
      continue;
    }

    // NaN
    if (ch === "N" && text.startsWith("NaN", i) && isBoundary(text[i-1]) && isBoundary(text[i+3])){
      out += "null";
      i += 2; // 跳過 a n
      continue;
    }

    // Infinity
    if (ch === "I" && text.startsWith("Infinity", i) && isBoundary(text[i-1]) && isBoundary(text[i+8])){
      out += "null";
      i += 7; // 跳過 nfinity
      continue;
    }

    // -Infinity
    if (ch === "-" && text.startsWith("-Infinity", i) && isBoundary(text[i-1]) && isBoundary(text[i+9])){
      out += "null";
      i += 8;
      continue;
    }

    out += ch;
  }

  return out;
}

function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}
function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

let dataAll = [];
let dataView = [];
let watch = loadJSON(LS.watch, []);
let visibleCols = loadJSON(LS.cols, COLS.slice(0,10).map(c=>c.key));
let pinnedCols = loadJSON(LS.pins, ["bond_code","bond_name"]);
let sortKey = localStorage.getItem(LS.sortKey) || "premium_pct";
let sortDir = localStorage.getItem(LS.sortDir) || "asc";

let colOrder = loadJSON(LS.order, null);

function ensureColOrder(){
  const allKeys = COLS.map(c=>c.key);
  if (!Array.isArray(colOrder) || colOrder.length === 0){
    colOrder = [...new Set([...pinnedCols, ...visibleCols, ...allKeys])];
  }
  colOrder = colOrder.filter(k => allKeys.includes(k));
  allKeys.forEach(k => { if (!colOrder.includes(k)) colOrder.push(k); });
  saveJSON(LS.order, colOrder);
}

function moveCol(key, delta){
  ensureColOrder();
  const i = colOrder.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= colOrder.length) return;
  [colOrder[i], colOrder[j]] = [colOrder[j], colOrder[i]];
  saveJSON(LS.order, colOrder);
  renderChooser();
  applyFilter();
}

ensureColOrder();


function renderWatch(){
  const box = el("watchChips");
  box.innerHTML = "";
  watch.forEach(code=>{
    const d = document.createElement("div");
    d.className = "chip";
    d.innerHTML = `<span>${code}</span>`;
    const b = document.createElement("button");
    b.textContent = "×";
    b.onclick = ()=>{ watch = watch.filter(x=>x!==code); saveJSON(LS.watch, watch); applyFilter(); renderWatch(); };
    d.appendChild(b);
    box.appendChild(d);
  });
}

function renderChooser(){
  const box = el("colChooser");
  box.innerHTML = "";
  const allKeys = COLS.map(c=>c.key);

  const order = [...new Set([...pinnedCols, ...visibleCols, ...allKeys])].filter(k=>allKeys.includes(k));
  
  ensureColOrder();
  order.forEach(k=>{
    const c = COLS.find(x=>x.key===k);
    const div = document.createElement("div");
    div.className = "colItem";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = visibleCols.includes(k);
    cb.onchange = ()=>{
      visibleCols = cb.checked ? Array.from(new Set([...visibleCols, k])) : visibleCols.filter(x=>x!==k);
      saveJSON(LS.cols, visibleCols);
      applyFilter();
    };
    const star = document.createElement("span");
    star.className = "star";
    const pinned = pinnedCols.includes(k);
    star.textContent = pinned ? "⭐" : "☆";
    star.onclick = ()=>{
      pinnedCols = pinned ? pinnedCols.filter(x=>x!==k) : Array.from(new Set([...pinnedCols, k]));
      saveJSON(LS.pins, pinnedCols);
      renderChooser();
      applyFilter();
    };
    const label = document.createElement("div");
    label.textContent = c.label;
    div.appendChild(cb);
    div.appendChild(star);
    div.appendChild(label);
	const moves = document.createElement("div");
	moves.className = "moveBtns";

	const up = document.createElement("button");
	up.type = "button";
	up.className = "moveBtn";
	up.textContent = "▲";
	up.title = "上移";
	up.onclick = ()=>moveCol(k, -1);

	const dn = document.createElement("button");
	dn.type = "button";
	dn.className = "moveBtn";
	dn.textContent = "▼";
	dn.title = "下移";
	dn.onclick = ()=>moveCol(k, 1);

	moves.appendChild(up);
	moves.appendChild(dn);
	div.appendChild(moves);
    box.appendChild(div);
  });

  const sel = el("selSortKey");
  sel.innerHTML = "";
  COLS.forEach(c=>{
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
  sel.value = sortKey;
  el("selSortDir").value = sortDir;
}

function sortData(arr){
  const dir = sortDir === "asc" ? 1 : -1;
  const k = sortKey;
  return arr.slice().sort((a,b)=>{
    const av = a[k]; const bv = b[k];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function applyFilter(){
  const wl = new Set(watch);
  dataView = dataAll.filter(r => wl.size===0 ? true : wl.has(String(r.bond_code)));
  dataView = sortData(dataView);
  renderTable();
  renderCards();   // ✅ 新增
  el("status").textContent = `資料筆數：${dataAll.length}｜顯示：${dataView.length}｜Watchlist：${watch.length}`;
}

function renderTable(){
  const tbl = el("tbl");
  ensureColOrder();

  const cols = colOrder.filter(k => visibleCols.includes(k) || pinnedCols.includes(k));
  const colDefs = cols.map(k=>COLS.find(c=>c.key===k)).filter(Boolean);

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  colDefs.forEach(c=>{
    const th = document.createElement("th");
    th.textContent = c.label;
    th.style.cursor = "pointer";
    th.onclick = ()=>{
      if (sortKey === c.key) sortDir = (sortDir === "asc" ? "desc" : "asc");
      else { sortKey = c.key; sortDir = "asc"; }
      localStorage.setItem(LS.sortKey, sortKey);
      localStorage.setItem(LS.sortDir, sortDir);
      applyFilter();
      renderChooser();
    };
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  const tbody = document.createElement("tbody");
  dataView.forEach(r=>{
    const tr = document.createElement("tr");
    colDefs.forEach(c=>{
      const td = document.createElement("td");
      td.textContent = fmt(r[c.key]);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  tbl.innerHTML = "";
  tbl.appendChild(thead);
  tbl.appendChild(tbody);
}

function colLabel(key){
  const c = COLS.find(x=>x.key===key);
  if (!c) return key;
  return c.label.split("(")[0]; // 取中文短標籤
}
function fmtCell(v){
  const s = fmt(v);
  return s === "" ? "—" : s;
}

function renderCards(){
  const box = el("cardList");
  if (!box) return;

  ensureColOrder();

  // 卡片一定顯示代號/名稱，其它依使用者勾選+釘選+順序
  const keys = ["bond_code","bond_name", ...colOrder.filter(k =>
    (visibleCols.includes(k) || pinnedCols.includes(k)) && !["bond_code","bond_name"].includes(k)
  )];

  box.innerHTML = "";
  dataView.forEach(r=>{
    const card = document.createElement("div");
    card.className = "bondCard";

    const head = document.createElement("div");
    head.className = "bondCardHeader";

    const left = document.createElement("div");
    const code = String(r.bond_code ?? "");
    const name = String(r.bond_name ?? "");
    left.innerHTML = `<div class="bondTitle">${code}</div><div class="bondSub">${name}</div>`;

    const right = document.createElement("div");
    right.className = "badges";
    const addBadge = (label, val)=>{
      if (val === null || val === undefined || val === "") return;
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = `${label}: ${val}`;
      right.appendChild(b);
    };

    // 你最常看的兩個，放在卡片右上角（不喜歡也可刪掉）
    addBadge("CB", fmtCell(r.cb_close));
    addBadge("溢價%", r.premium_pct == null ? "" : `${fmt(r.premium_pct)}%`);

    head.appendChild(left);
    head.appendChild(right);

    const grid = document.createElement("div");
    grid.className = "kvGrid";

    keys.forEach(k=>{
      if (k === "bond_code" || k === "bond_name") return;
      const kv = document.createElement("div");
      kv.className = "kv";
      const v = (k === "premium_pct" && r[k] != null) ? `${fmt(r[k])}%` : fmtCell(r[k]);
      kv.innerHTML = `<div class="k">${colLabel(k)}</div><div class="v">${v}</div>`;
      grid.appendChild(kv);
    });

    card.appendChild(head);
    card.appendChild(grid);
    box.appendChild(card);
  });
}


async function fetchDriveGzipJson(apiKey, fileId, opts = {}) {
  const cacheBust = !!opts.cacheBust;
  const t = cacheBust ? `&t=${Date.now()}` : "";
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(apiKey)}${t}`;

  const res = await fetch(url, {
    cache: cacheBust ? "no-store" : "default",
  });

  if (!res.ok) throw new Error(`下載失敗：${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();

  if (!("DecompressionStream" in window)) {
    throw new Error("你的瀏覽器不支援 gzip 解壓（DecompressionStream）。建議用 Chrome/Edge 或更新 iOS/Android 版本。");
  }
  const ds = new DecompressionStream("gzip");
  const decompressedStream = new Response(new Blob([buf]).stream().pipeThrough(ds));
  const text = await decompressedStream.text();
  const cleanText = sanitizeNonStandardJSON(text);

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    const m2 = msg.match(/position\s+(\d+)/i);
    if (m2) {
      const p = Math.max(0, Math.min(cleanText.length, Number(m2[1])));
      const snippet = cleanText.slice(Math.max(0, p - 80), Math.min(cleanText.length, p + 80));
      throw new Error(`JSON 解析失敗：${msg}｜附近片段：${snippet}`);
    }
    throw new Error(`JSON 解析失敗：${msg}`);
  }
}

async function purgePwaDataCache(){
  if (!("serviceWorker" in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "PURGE_DATA_CACHE" });
  }catch(_){}
}

async function refresh(force = false) {
  const apiKey = localStorage.getItem(LS.apiKey) || "";
  const fileId = localStorage.getItem(LS.fileId) || "";
  if (!apiKey || !fileId) {
    el("status").textContent = "請先點『資料來源』設定 API key / file id";
    return;
  }
  el("status").textContent = force ? "強制更新中..." : "下載中...";

  try {
    const payload = await fetchDriveGzipJson(apiKey, fileId, { cacheBust: force });
    dataAll = payload;
    applyFilter();
  } catch (e) {
    console.error(e);
    el("status").textContent = `錯誤：${e.message}`;
  }
}


// ===== Trend (CB 近3M 成交價/量) =====
let trendCache = null;

async function getTrendPayload(force = false) {
  if (trendCache && !force) return trendCache;

  const apiKey = localStorage.getItem(LS.apiKey) || "";
  const trendFileId = localStorage.getItem(LS.trendFileId) || "";
  if (!apiKey || !trendFileId) {
    throw new Error("尚未設定『趨勢檔案 ID』。請到『資料來源』填入 cb_trend_3m.json.gz 的 file id。");
  }
  trendCache = await fetchDriveGzipJson(apiKey, trendFileId, { cacheBust: force });
  return trendCache;
}

function fmtNum(x, digits = 2) {
  if (x === null || x === undefined) return "--";
  if (typeof x === "number" && Number.isFinite(x)) return x.toFixed(digits);
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(digits) : String(x);
}

function drawTrend(canvas, pts) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 360;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = 28;
  const gap = 18;
  const hPrice = Math.floor((cssH - pad*2 - gap) * 0.62);
  const hVol   = (cssH - pad*2 - gap) - hPrice;

  const x0 = pad, y0 = pad, w = cssW - pad*2;
  const yPrice0 = y0, yPrice1 = y0 + hPrice;
  const yVol0 = yPrice1 + gap, yVol1 = yVol0 + hVol;

  ctx.clearRect(0, 0, cssW, cssH);

  if (!pts || pts.length === 0) {
    ctx.font = "14px system-ui";
    ctx.fillStyle = "#111827";
    ctx.fillText("近 3M 無成交資料", pad, pad + 18);
    return;
  }

  const dates = pts.map(p => new Date(p.d + "T00:00:00"));
  const tMin = Math.min(...dates.map(d => d.getTime()));
  const tMax = Math.max(...dates.map(d => d.getTime())) || (tMin + 86400000);

  const cVals = pts.map(p => Number(p.c)).filter(v => Number.isFinite(v));
  const uVals = pts.map(p => Number(p.u)).filter(v => Number.isFinite(v));

  const cMin = Math.min(...cVals);
  const cMax = Math.max(...cVals);
  const uMax = uVals.length ? Math.max(...uVals) : 0;

  const xOf = (d) => {
    const t = new Date(d + "T00:00:00").getTime();
    const r = (tMax === tMin) ? 1 : (t - tMin) / (tMax - tMin);
    return x0 + r * w;
  };
  const yPriceOf = (c) => {
    const r = (cMax === cMin) ? 0.5 : (c - cMin) / (cMax - cMin);
    return yPrice1 - r * (hPrice - 10);
  };
  const yVolOf = (u) => {
    const r = (uMax === 0) ? 0 : (u / uMax);
    return yVol1 - r * (hVol - 10);
  };

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, yPrice1); ctx.lineTo(x0 + w, yPrice1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, yVol1); ctx.lineTo(x0 + w, yVol1); ctx.stroke();

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.d);
    const y = yPriceOf(Number(p.c));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#111827";
  pts.forEach((p) => {
    const x = xOf(p.d);
    const y = yPriceOf(Number(p.c));
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  const barW = 4;
  ctx.fillStyle = "rgba(17,24,39,.30)";
  pts.forEach((p) => {
    const u = Number(p.u);
    if (!Number.isFinite(u) || u <= 0) return;
    const x = xOf(p.d);
    const y = yVolOf(u);
    ctx.fillRect(x - barW/2, y, barW, yVol1 - y);
  });

  ctx.fillStyle = "#374151";
  ctx.font = "12px system-ui";
  ctx.fillText(`成交價（Min ${fmtNum(cMin)} / Max ${fmtNum(cMax)}）`, x0, yPrice0 - 8);
  ctx.fillText(`成交量（Max ${uMax || 0}）`, x0, yVol0 - 8);
}

async function openTrendForRow(r) {
  const code = String(r["bond_code"] ?? "").trim();
  const shortName = (r["可轉債短名"] || r["可轉債名稱"] || "").toString().trim();
  const title = `${shortName || code}（${code}）`;

  const dlg = document.getElementById("dlgTrend");
  if (!dlg) throw new Error("缺少 dlgTrend（請更新 index.html）");

  document.getElementById("trendTitle").textContent = title;
  const meta = document.getElementById("trendMeta");
  meta.textContent = "載入趨勢中...";
  dlg.showModal();

  try {
    const tp = await getTrendPayload(false);
    const series = (tp && tp.series) ? tp.series : {};
    const pts = series[code] || [];
    const last = pts.length ? pts[pts.length - 1] : null;

    meta.innerHTML =
      `近 ${tp.months || 3}M 成交日數：<b>${pts.length}</b>　` +
      `資料日期：<b>${tp.asof || "--"}</b>　` +
      (last ? `最後成交：<b>${last.d}</b>　收盤：<b>${fmtNum(last.c)}</b>　量：<b>${last.u ?? 0}</b>` : "（近 3M 無成交）");

    const canvas = document.getElementById("trendCanvas");
    requestAnimationFrame(() => drawTrend(canvas, pts));
  } catch (e) {
    console.error(e);
    meta.textContent = `載入失敗：${e.message || e}`;
    const canvas = document.getElementById("trendCanvas");
    drawTrend(canvas, []);
  }
}


function wire(){
  el("btnAdd").onclick = ()=>{
    const v = el("inpAdd").value.trim();
    if (!v) return;
    if (!watch.includes(v)) watch.push(v);
    saveJSON(LS.watch, watch);
    el("inpAdd").value = "";
    renderWatch();
    applyFilter();
  };

el("btnRefresh").onclick = ()=> refresh(true);

  el("btnApplySort").onclick = ()=>{
    sortKey = el("selSortKey").value;
    sortDir = el("selSortDir").value;
    localStorage.setItem(LS.sortKey, sortKey);
    localStorage.setItem(LS.sortDir, sortDir);
    applyFilter();
  };

  const dlg = el("dlgSettings");
  el("btnSettings").onclick = ()=>{
    el("inpApiKey").value = localStorage.getItem(LS.apiKey) || "";
    el("inpFileId").value = localStorage.getItem(LS.fileId) || "";
    el("inpTrendFileId").value = localStorage.getItem(LS.trendFileId) || "";
    dlg.showModal();
  };
  el("btnSave").onclick = ()=>{
    localStorage.setItem(LS.apiKey, el("inpApiKey").value.trim());
    localStorage.setItem(LS.fileId, el("inpFileId").value.trim());
    localStorage.setItem(LS.trendFileId, el("inpTrendFileId").value.trim());
    trendCache = null;
  };

  renderWatch();
  renderChooser();
  applyFilter();
}
wire();
