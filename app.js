// ===== LocalStorage keys =====
const LS = {
  apiKey: "cb_apiKey",
  fileId: "cb_fileId",
  trendFileId: "cb_trendFileId",
  watch: "cb_watchlist",
  cols: "cb_cols_visible",
  pins: "cb_cols_pinned",
  order: "cb_cols_order",
  sortKey: "cb_sortKey",
  sortDir: "cb_sortDir",
};

const el = (id)=>document.getElementById(id);

// -------- JSON helpers --------
function loadJSON(key, fallback){
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}
function saveJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

// 將非標準 JSON token（NaN / Infinity）在「非字串區段」轉成 null，避免 JSON.parse 失敗
function sanitizeNonStandardJSON(text){
  const isBoundary = (ch)=> !ch || !(/[0-9A-Za-z_]/.test(ch));

  let out = "";
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++){
    const ch = text[i];

    if (inStr){
      out += ch;
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }

    if (ch === '"'){
      inStr = true;
      out += ch;
      continue;
    }

    if (ch === "N" && text.startsWith("NaN", i) && isBoundary(text[i-1]) && isBoundary(text[i+3])){
      out += "null"; i += 2; continue;
    }
    if (ch === "I" && text.startsWith("Infinity", i) && isBoundary(text[i-1]) && isBoundary(text[i+8])){
      out += "null"; i += 7; continue;
    }
    if (ch === "-" && text.startsWith("-Infinity", i) && isBoundary(text[i-1]) && isBoundary(text[i+9])){
      out += "null"; i += 8; continue;
    }

    out += ch;
  }
  return out;
}

// -------- Format helpers --------
function fmt(v){
  if (v === null || v === undefined) return "";
  if (typeof v === "number"){
    if (!Number.isFinite(v)) return "";
    if (Number.isInteger(v)) return v.toLocaleString();
    return (Math.round(v*1000)/1000).toLocaleString();
  }
  return String(v);
}
function fmtCell(v){
  const s = fmt(v);
  return s === "" ? "—" : s;
}
function fmtNum(x, digits = 2){
  if (x === null || x === undefined) return "--";
  if (typeof x === "number" && Number.isFinite(x)) return x.toFixed(digits);
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(digits) : String(x);
}

// -------- Data state --------
let dataAll = [];
let dataView = [];

let watch = loadJSON(LS.watch, []);
let visibleCols = loadJSON(LS.cols, []);
let pinnedCols = loadJSON(LS.pins, ["bond_code"]);
let colOrder = loadJSON(LS.order, null);

let sortKey = localStorage.getItem(LS.sortKey) || "轉換溢價率";
let sortDir = localStorage.getItem(LS.sortDir) || "asc";
let qText = "";

// COLS 會依資料自動建（同時支援：舊 raw snapshot / 新 card payload）
let COLS = [];

const LABEL_MAP = {
  // 新 card payload（thefew 欄位）
  "bond_code": "可轉債代號",
  "可轉債名稱": "可轉債名稱",
  "轉換標的名稱": "轉換標的名稱",
  "上市櫃別": "上市櫃別",
  "最新CB收盤價": "最新 CB 收盤價",
  "轉換價值": "轉換價值(每百元)",
  "CBAS 權利金（百元報價）": "CBAS 權利金",
  "CBAS 折現率": "CBAS 折現率",
  "轉換溢價率": "轉換溢價率(%)",
  "最新股票收盤價": "最新股票收盤價",
  "目前轉換價": "目前轉換價",
  "發行時轉換價": "發行時轉換價",
  "發行價格": "發行價格",
  "發行總額(百萬)": "發行總額(百萬)",
  "最新餘額(百萬)": "最新餘額(百萬)",
  "轉換比例": "轉換比例(%)",
  "發行日": "發行日",
  "到期日": "到期日",
  "到期賣回價格": "到期賣回價格",
  "下次提前賣回日": "下次提前賣回日",
  "下次提前賣回價格": "下次提前賣回價格",

  // 舊 raw snapshot（兼容）
  "bond_name": "債券名稱",
  "issuer_name": "發行機構",
  "issuer_stock_close": "標的股收盤價",
  "issuer_stock_market": "標的市場",
  "cb_close": "CB 收盤價",
  "premium_pct": "轉換溢價率(%)",
  "conv_value_100": "轉換價值(每百元)",
  "conv_price": "最新轉換價",
  "listed_date": "掛牌日",
  "maturity": "到期日",
};

function labelOf(key){
  return LABEL_MAP[key] || key;
}

function buildColsFromData(rows){
  const r0 = rows && rows.length ? rows[0] : null;
  if (!r0) return [];

  const keys = Object.keys(r0);
  // 想要固定顯示/排序的 key（若存在）
  const preferred = [
    "bond_code",
    "可轉債名稱","bond_name",
    "轉換標的名稱","issuer_name",
    "上市櫃別","issuer_stock_market",
    "最新CB收盤價","cb_close",
    "轉換價值","conv_value_100",
    "轉換溢價率","premium_pct",
    "最新股票收盤價","issuer_stock_close",
    "目前轉換價","conv_price",
    "發行時轉換價","issue_conv_price",
    "發行總額(百萬)","issued_amt",
    "最新餘額(百萬)","remaining_bonds",
    "轉換比例","converted_ratio_pct",
    "發行日","listed_date",
    "到期日","maturity",
    "下次提前賣回日","next_put_date",
    "下次提前賣回價格","next_put_price_pct",
  ];

  const seen = new Set();
  const ordered = [];

  preferred.forEach(k=>{
    if (keys.includes(k) && !seen.has(k)){
      ordered.push(k); seen.add(k);
    }
  });
  keys.forEach(k=>{
    if (!seen.has(k)){
      ordered.push(k); seen.add(k);
    }
  });

  return ordered.map(k=>({ key: k, label: labelOf(k) }));
}

function ensureColState(){
  const allKeys = COLS.map(c=>c.key);
  if (!Array.isArray(colOrder) || colOrder.length === 0){
    colOrder = [...allKeys];
  }
  colOrder = colOrder.filter(k => allKeys.includes(k));
  allKeys.forEach(k => { if (!colOrder.includes(k)) colOrder.push(k); });

  if (!Array.isArray(visibleCols) || visibleCols.length === 0){
    // 預設顯示前 12 欄
    visibleCols = colOrder.slice(0, Math.min(12, colOrder.length));
  }
  visibleCols = visibleCols.filter(k=>allKeys.includes(k));

  if (!Array.isArray(pinnedCols) || pinnedCols.length === 0){
    pinnedCols = ["bond_code"].filter(k=>allKeys.includes(k));
  }
  pinnedCols = pinnedCols.filter(k=>allKeys.includes(k));

  // sortKey 若不存在，退回第一欄
  if (!allKeys.includes(sortKey)){
    sortKey = allKeys[0] || sortKey;
    localStorage.setItem(LS.sortKey, sortKey);
  }

  saveJSON(LS.order, colOrder);
  saveJSON(LS.cols, visibleCols);
  saveJSON(LS.pins, pinnedCols);
}

function moveCol(key, delta){
  ensureColState();
  const i = colOrder.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= colOrder.length) return;
  [colOrder[i], colOrder[j]] = [colOrder[j], colOrder[i]];
  saveJSON(LS.order, colOrder);
  renderChooser();
  applyFilter();
}

function renderSortUI(){
  const sel = el("selSort");
  if (!sel) return;
  sel.innerHTML = "";

  COLS.forEach(c=>{
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });

  sel.value = sortKey;
  const btnDir = el("btnSortDir");
  if (btnDir) btnDir.textContent = (sortDir === "asc") ? "↑" : "↓";
}

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
  if (!box) return;
  box.innerHTML = "";

  ensureColState();
  colOrder.forEach(k=>{
    const c = COLS.find(x=>x.key===k);
    if (!c) return;

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

    div.appendChild(cb);
    div.appendChild(star);
    div.appendChild(label);
    div.appendChild(moves);
    box.appendChild(div);
  });
}

function sortData(arr){
  const dir = sortDir === "asc" ? 1 : -1;
  const k = sortKey;
  return arr.slice().sort((a,b)=>{
    const av = a[k]; const bv = b[k];
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    const an = Number(av), bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function matchesWatch(row, code){
  // watchlist 混用：優先比 bond_code；若資料有 issuer_code/issuer_stock_code 也可比
  const bc = String(row["bond_code"] ?? row.bond_code ?? "").trim();
  if (bc && bc === code) return true;

  const issuerCode = String(row["issuer_code"] ?? row["issuer_stock_code"] ?? row.issuer_code ?? row.issuer_stock_code ?? "").trim();
  if (issuerCode && issuerCode === code) return true;

  // 最後：若使用者輸入 4 碼但資料沒有 issuer_code，仍可用名稱搜尋補救
  const name = String(row["可轉債名稱"] ?? row.bond_name ?? "").trim();
  const issuer = String(row["轉換標的名稱"] ?? row.issuer_name ?? "").trim();
  if (code.length === 4 && (name.includes(code) || issuer.includes(code))) return true;

  return false;
}

function applyFilter(){
  const wl = new Set(watch.map(x=>String(x)));
  const q = (qText || "").trim().toLowerCase();

  dataView = dataAll.filter(r => {
    // watchlist
    if (wl.size > 0){
      let ok = false;
      for (const code of wl){
        if (matchesWatch(r, code)) { ok = true; break; }
      }
      if (!ok) return false;
    }

    // search
    if (q){
      const hay = Object.values(r).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  dataView = sortData(dataView);
  renderTable();
  renderCards();

  el("status").textContent = `資料筆數：${dataAll.length}｜顯示：${dataView.length}｜Watchlist：${watch.length}`;
}

function renderTable(){
  const tbl = el("tbl");
  if (!tbl) return;

  ensureColState();
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
      renderSortUI();
      applyFilter();
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

// -------- Cards --------
function getKey(row, ...keys){
  for (const k of keys){
    if (k in row) return k;
  }
  return null;
}

function renderCards(){
  const box = el("cardList");
  if (!box) return;

  ensureColState();
  const keys = colOrder.filter(k => (visibleCols.includes(k) || pinnedCols.includes(k)));

  box.innerHTML = "";

  dataView.forEach(r=>{
    const card = document.createElement("div");
    card.className = "bondCard";

    const head = document.createElement("div");
    head.className = "bondCardHeader";

    const left = document.createElement("div");

    const kCode = getKey(r, "bond_code");
    const kName = getKey(r, "可轉債名稱","bond_name");
    const kSub  = getKey(r, "轉換標的名稱","issuer_name");

    const code = kCode ? String(r[kCode] ?? "") : "";
    const name = kName ? String(r[kName] ?? "") : "";
    const sub  = kSub  ? String(r[kSub] ?? "") : "";

    left.innerHTML = `<div class="bondTitle">${code}</div><div class="bondSub">${name}${sub ? "｜"+sub : ""}</div>`;

    const right = document.createElement("div");
    right.className = "badges";

    const addBadge = (label, val)=>{
      if (val === null || val === undefined) return;
      const s = String(val).trim();
      if (!s) return;
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = `${label}: ${s}`;
      right.appendChild(b);
    };

    const kCb = getKey(r, "最新CB收盤價","cb_close");
    const kPrem = getKey(r, "轉換溢價率","premium_pct");

    if (kCb) addBadge("CB", fmtCell(r[kCb]));
    if (kPrem){
      const v = r[kPrem];
      if (typeof v === "number") addBadge("溢價%", `${fmtNum(v,2)}%`);
      else addBadge("溢價%", fmtCell(v));
    }

    // 趨勢按鈕（📈3M）
    const btnTrend = document.createElement("button");
    btnTrend.className = "btnTrend";
    btnTrend.textContent = "📈3M";
    btnTrend.onclick = ()=>openTrendForRow(r);
    right.appendChild(btnTrend);

    head.appendChild(left);
    head.appendChild(right);

    const grid = document.createElement("div");
    grid.className = "kvGrid";

    keys.forEach(k=>{
      if (["bond_code","可轉債名稱","bond_name","轉換標的名稱","issuer_name"].includes(k)) return;
      const v = r[k];
      if (v === null || v === undefined || v === "") return;

      const kv = document.createElement("div");
      kv.className = "kv";

      let vv = fmtCell(v);
      // 數字欄位美化
      if (typeof v === "number" && Number.isFinite(v)){
        if (k.includes("溢價") || k.includes("比例") || k.endsWith("%")) vv = `${fmtNum(v,2)}%`;
        else vv = fmtNum(v,2);
      }

      kv.innerHTML = `<div class="k">${labelOf(k)}</div><div class="v">${vv}</div>`;
      grid.appendChild(kv);
    });

    card.appendChild(head);
    card.appendChild(grid);
    box.appendChild(card);
  });
}

// -------- Drive fetch (gzip json) --------
async function fetchDriveGzipJson(apiKey, fileId, opts = {}) {
  const cacheBust = !!opts.cacheBust;
  const t = cacheBust ? `&t=${Date.now()}` : "";
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(apiKey)}${t}`;

  const res = await fetch(url, { cache: cacheBust ? "no-store" : "default" });
  if (!res.ok) throw new Error(`下載失敗：${res.status} ${res.statusText}`);

  const buf = await res.arrayBuffer();
  if (!("DecompressionStream" in window)) {
    throw new Error("瀏覽器不支援 gzip 解壓（DecompressionStream）。請用 Chrome/Edge 或更新系統。");
  }

  const ds = new DecompressionStream("gzip");
  const decompressedStream = new Response(new Blob([buf]).stream().pipeThrough(ds));
  const text = await decompressedStream.text();
  const cleanText = sanitizeNonStandardJSON(text);
  return JSON.parse(cleanText);
}

// -------- Refresh (card payload) --------
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
    dataAll = Array.isArray(payload) ? payload : (payload?.rows || payload?.data || []);

    // 動態建立欄位
    COLS = buildColsFromData(dataAll);
    ensureColState();
    renderSortUI();
    renderChooser();

    applyFilter();
  } catch (e) {
    console.error(e);
    el("status").textContent = `錯誤：${e.message || e}`;
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

function drawTrend(canvas, pts) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 360;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // layout
  const padL = 56;   // left labels
  const padR = 18;
  const padT = 26;
  const padB = 30;   // bottom x labels
  const gap = 18;

  const innerW = cssW - padL - padR;
  const innerH = cssH - padT - padB;

  const hPrice = Math.floor((innerH - gap) * 0.62);
  const hVol   = innerH - gap - hPrice;

  const x0 = padL, x1 = padL + innerW;
  const yPrice0 = padT, yPrice1 = padT + hPrice;
  const yVol0 = yPrice1 + gap, yVol1 = yVol0 + hVol;

  ctx.clearRect(0, 0, cssW, cssH);

  if (!pts || pts.length === 0) {
    ctx.font = "14px system-ui";
    ctx.fillStyle = "#111827";
    ctx.fillText("近 3M 無成交資料", padL, padT + 18);
    return;
  }

  // domains
  const dates = pts.map(p => new Date(p.d + "T00:00:00"));
  const tMin = Math.min(...dates.map(d => d.getTime()));
  const tMax = Math.max(...dates.map(d => d.getTime())) || (tMin + 86400000);

  const cVals = pts.map(p => Number(p.c)).filter(v => Number.isFinite(v));
  const uVals = pts.map(p => Number(p.u)).filter(v => Number.isFinite(v));

  let cMin = Math.min(...cVals);
  let cMax = Math.max(...cVals);
  const uMax = uVals.length ? Math.max(...uVals) : 0;

  // pad price range a bit so line isn't glued to edges
  if (Number.isFinite(cMin) && Number.isFinite(cMax) && cMax > cMin) {
    const pad = (cMax - cMin) * 0.06;
    cMin -= pad;
    cMax += pad;
  } else {
    cMin -= 1;
    cMax += 1;
  }

  const xOf = (d) => {
    const t = new Date(d + "T00:00:00").getTime();
    const r = (tMax === tMin) ? 1 : (t - tMin) / (tMax - tMin);
    return x0 + r * innerW;
  };
  const yPriceOf = (c) => {
    const r = (cMax === cMin) ? 0.5 : (c - cMin) / (cMax - cMin);
    return yPrice1 - r * (hPrice - 6);
  };
  const yVolOf = (u) => {
    const r = (uMax === 0) ? 0 : (u / uMax);
    return yVol1 - r * (hVol - 6);
  };

  // helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtDate = (t) => {
    const d = new Date(t);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
  };

  // grid: y ticks
  const yTicksPrice = 5;
  const yTicksVol = 3;

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  // horizontal gridlines (price)
  for (let i = 0; i < yTicksPrice; i++) {
    const r = i / (yTicksPrice - 1);
    const y = yPrice1 - r * (hPrice - 6);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

    const val = cMin + r * (cMax - cMin);
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtNum(val, 2), x0 - 8, y);
  }

  // horizontal gridlines (volume)
  for (let i = 0; i < yTicksVol; i++) {
    const r = i / (yTicksVol - 1);
    const y = yVol1 - r * (hVol - 6);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

    const val = r * uMax;
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(Math.round(val).toLocaleString(), x0 - 8, y);
  }

  // vertical gridlines + x labels (bottom)
  const xTicks = 6;
  for (let i = 0; i < xTicks; i++) {
    const r = i / (xTicks - 1);
    const t = tMin + r * (tMax - tMin);
    const x = x0 + r * innerW;

    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yPrice0); ctx.lineTo(x, yVol1); ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.font = "12px system-ui";
    ctx.textAlign = (i === 0) ? "left" : (i === xTicks - 1) ? "right" : "center";
    ctx.textBaseline = "top";
    ctx.fillText(fmtDate(t), x, yVol1 + 8);
  }

  // section labels
  ctx.fillStyle = "#374151";
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("成交價", x0, yPrice0 - 6);
  ctx.fillText("成交量", x0, yVol0 - 6);

  // price line
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

  // points + value tooltip-ish (optional minimal: last point label)
  ctx.fillStyle = "#111827";
  pts.forEach((p) => {
    const x = xOf(p.d);
    const y = yPriceOf(Number(p.c));
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  });

  const last = pts[pts.length - 1];
  if (last && Number.isFinite(Number(last.c))) {
    const x = xOf(last.d);
    const y = yPriceOf(Number(last.c));
    ctx.fillStyle = "#111827";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tx = clamp(x + 8, x0 + 6, x1 - 60);
    ctx.fillText(fmtNum(Number(last.c), 2), tx, y);
  }

  // volume bars
  const barW = Math.max(2, Math.floor(innerW / Math.max(pts.length, 30)));
  ctx.fillStyle = "rgba(17,24,39,.30)";
  pts.forEach((p) => {
    const u = Number(p.u);
    if (!Number.isFinite(u) || u <= 0) return;
    const x = xOf(p.d);
    const y = yVolOf(u);
    ctx.fillRect(x - barW/2, y, barW, yVol1 - y);
  });

  // min/max hint
  const cMinReal = Math.min(...cVals);
  const cMaxReal = Math.max(...cVals);
  ctx.fillStyle = "#374151";
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`(Min ${fmtNum(cMinReal)} / Max ${fmtNum(cMaxReal)})`, x0 + 44, yPrice0 - 20);
  ctx.fillText(`(Max ${uMax || 0})`, x0 + 44, yVol0 - 20);
}

async function openTrendForRow(r) {
  const code = String(r["bond_code"] ?? r.bond_code ?? "").trim();
  const shortName = String(r["可轉債名稱"] ?? r.bond_name ?? code).trim();
  const title = `${shortName || code}（${code}）`;

  const dlg = el("dlgTrend");
  if (!dlg) {
    alert("缺少趨勢視窗（dlgTrend）。請確認 index.html 已更新。");
    return;
  }

  el("trendTitle").textContent = title;
  const meta = el("trendMeta");
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

    const canvas = el("trendCanvas");
    requestAnimationFrame(() => drawTrend(canvas, pts));
  } catch (e) {
    console.error(e);
    meta.textContent = `載入失敗：${e.message || e}`;
    drawTrend(el("trendCanvas"), []);
  }
}

// -------- Wire UI --------
function wire(){
  // Watchlist add
  const addOne = ()=>{
    const v = (el("inpAdd").value || "").trim();
    if (!v) return;
    if (!watch.includes(v)) watch.push(v);
    saveJSON(LS.watch, watch);
    el("inpAdd").value = "";
    renderWatch();
    applyFilter();
  };
  el("btnAdd").onclick = addOne;
  el("inpAdd").addEventListener("keydown", (e)=>{ if (e.key === "Enter") { e.preventDefault(); addOne(); }});

  // Clear watchlist
  el("btnClear").onclick = ()=>{
    watch = [];
    saveJSON(LS.watch, watch);
    renderWatch();
    applyFilter();
  };

  // Search
  el("inpQ").addEventListener("input", ()=>{
    qText = el("inpQ").value || "";
    applyFilter();
  });

  // Sort
  el("selSort").addEventListener("change", ()=>{
    sortKey = el("selSort").value;
    localStorage.setItem(LS.sortKey, sortKey);
    applyFilter();
  });
  el("btnSortDir").onclick = ()=>{
    sortDir = (sortDir === "asc") ? "desc" : "asc";
    localStorage.setItem(LS.sortDir, sortDir);
    renderSortUI();
    applyFilter();
  };

  // Refresh / Force
  el("btnRefresh").onclick = ()=> refresh(false);
  el("btnForce").onclick = ()=> { trendCache = null; refresh(true); };

  // Settings dialog
  const dlg = el("dlgSettings");
  el("btnSettings").onclick = ()=>{
    el("inpApiKey").value = localStorage.getItem(LS.apiKey) || "";
    el("inpFileId").value = localStorage.getItem(LS.fileId) || "";
    el("inpTrendFileId").value = localStorage.getItem(LS.trendFileId) || "";
    dlg.showModal();
  };
  el("btnSave").onclick = ()=>{
    localStorage.setItem(LS.apiKey, (el("inpApiKey").value || "").trim());
    localStorage.setItem(LS.fileId, (el("inpFileId").value || "").trim());
    localStorage.setItem(LS.trendFileId, (el("inpTrendFileId").value || "").trim());
    trendCache = null;
  };

  // init UI
  renderWatch();
  // 若尚未載入資料也先讓 UI 不會崩
  renderSortUI();
  renderChooser();

  // 可選：自動載入（你也可以關掉）
  refresh(false);
}

wire();
