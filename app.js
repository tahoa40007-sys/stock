const LS = {
  apiKey: "cb_apiKey",
  fileId: "cb_fileId",
  watch: "cb_watchlist",
  cols: "cb_cols_visible",
  pins: "cb_cols_pinned",
  order: "cb_cols_order",
  sortKey: "cb_sortKey",
  sortDir: "cb_sortDir",
};

// === 08 輸出的「卡片 payload」欄位（中文） ===
const COLS = [
  { key: "bond_code", label: "可轉債代號" },
  { key: "issuer_code", label: "股票代號（4碼）" },

  { key: "可轉債短名", label: "可轉債名稱" },
  { key: "可轉債名稱", label: "完整名稱" },
  { key: "轉換標的名稱", label: "轉換標的" },
  { key: "上市櫃別", label: "上市櫃別" },

  { key: "最新CB收盤價", label: "最新 CB 收盤價" },
  { key: "轉換價值", label: "轉換價值" },
  { key: "轉換溢價率", label: "轉換溢價率" },
  { key: "轉換溢價率%", label: "轉換溢價率（排序用）" },

  { key: "最新股票收盤價", label: "最新股票收盤價" },

  { key: "目前轉換價", label: "目前轉換價" },
  { key: "發行時轉換價", label: "發行時轉換價" },

  { key: "發行價格", label: "發行價格" },
  { key: "發行總額(百萬)", label: "發行總額(百萬)" },
  { key: "最新餘額(百萬)", label: "最新餘額(百萬)" },

  { key: "轉換比例", label: "轉換比例" },
  { key: "轉換比例%", label: "轉換比例（排序用）" },

  { key: "發行日", label: "發行日" },
  { key: "到期日", label: "到期日" },
  { key: "到期賣回價格", label: "到期賣回價格" },
  { key: "下次提前賣回日", label: "下次提前賣回日" },
  { key: "下次提前賣回價格", label: "下次提前賣回價格" },
];

const ALL_KEYS = COLS.map(c => c.key);

// === thefew 風格預設：你朋友打開就像 thefew ===
const DEFAULT_PINNED = ["可轉債短名", "bond_code"];
const DEFAULT_VISIBLE = [
  "最新CB收盤價",
  "轉換價值",
  "轉換溢價率",
  "最新股票收盤價",
  "目前轉換價",
  "發行總額(百萬)",
  "最新餘額(百萬)",
  "轉換比例",
  "發行日",
  "到期日",
  "下次提前賣回日",
  "下次提前賣回價格",
];
const DEFAULT_SORT_KEY = "轉換溢價率%";
const DEFAULT_SORT_DIR = "asc";

const el = (id) => document.getElementById(id);

const fmt = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return (Math.round(v * 1000) / 1000).toLocaleString();
  }
  return String(v);
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// 將非標準 JSON token（NaN / Infinity）在「非字串區段」轉成 null，避免 JSON.parse 失敗
function sanitizeNonStandardJSON(text) {
  const isBoundary = (ch) => !ch || !(/[0-9A-Za-z_]/.test(ch));

  let out = "";
  let inStr = false;
  let esc = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inStr) {
      out += ch;
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      out += ch;
      continue;
    }

    if (ch === "N" && text.startsWith("NaN", i) && isBoundary(text[i - 1]) && isBoundary(text[i + 3])) {
      out += "null"; i += 2; continue;
    }
    if (ch === "I" && text.startsWith("Infinity", i) && isBoundary(text[i - 1]) && isBoundary(text[i + 8])) {
      out += "null"; i += 7; continue;
    }
    if (ch === "-" && text.startsWith("-Infinity", i) && isBoundary(text[i - 1]) && isBoundary(text[i + 9])) {
      out += "null"; i += 8; continue;
    }

    out += ch;
  }
  return out;
}

let dataAll = [];
let dataView = [];

// === 讀取偏好（舊版 localStorage 可能還留著舊欄位，這裡會自動修正/回復預設） ===
let watch = loadJSON(LS.watch, []);
let visibleCols = loadJSON(LS.cols, DEFAULT_VISIBLE);
let pinnedCols = loadJSON(LS.pins, DEFAULT_PINNED);
let sortKey = localStorage.getItem(LS.sortKey) || DEFAULT_SORT_KEY;
let sortDir = localStorage.getItem(LS.sortDir) || DEFAULT_SORT_DIR;
let colOrder = loadJSON(LS.order, null);

function normalizePrefs() {
  const valid = (arr) => Array.isArray(arr) ? arr.filter(k => ALL_KEYS.includes(k)) : [];

  pinnedCols = valid(pinnedCols);
  visibleCols = valid(visibleCols);

  if (pinnedCols.length === 0) pinnedCols = [...DEFAULT_PINNED];
  if (visibleCols.length === 0) visibleCols = [...DEFAULT_VISIBLE];

  if (!ALL_KEYS.includes(sortKey)) sortKey = DEFAULT_SORT_KEY;
  if (!["asc", "desc"].includes(sortDir)) sortDir = DEFAULT_SORT_DIR;

  saveJSON(LS.pins, pinnedCols);
  saveJSON(LS.cols, visibleCols);
  localStorage.setItem(LS.sortKey, sortKey);
  localStorage.setItem(LS.sortDir, sortDir);
}

function ensureColOrder() {
  const allKeys = ALL_KEYS;
  if (!Array.isArray(colOrder) || colOrder.length === 0) {
    colOrder = [...new Set([...pinnedCols, ...visibleCols, ...allKeys])];
  }
  colOrder = colOrder.filter(k => allKeys.includes(k));
  allKeys.forEach(k => { if (!colOrder.includes(k)) colOrder.push(k); });
  saveJSON(LS.order, colOrder);
}

function moveCol(key, delta) {
  ensureColOrder();
  const i = colOrder.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= colOrder.length) return;
  [colOrder[i], colOrder[j]] = [colOrder[j], colOrder[i]];
  saveJSON(LS.order, colOrder);
  renderChooser();
  applyFilter();
}

normalizePrefs();
ensureColOrder();

function renderWatch() {
  const box = el("watchChips");
  box.innerHTML = "";
  watch.forEach(code => {
    const d = document.createElement("div");
    d.className = "chip";
    d.innerHTML = `<span>${code}</span>`;
    const b = document.createElement("button");
    b.textContent = "×";
    b.onclick = () => {
      watch = watch.filter(x => x !== code);
      saveJSON(LS.watch, watch);
      applyFilter();
      renderWatch();
    };
    d.appendChild(b);
    box.appendChild(d);
  });
}

function renderChooser() {
  const box = el("colChooser");
  box.innerHTML = "";

  ensureColOrder();

  // 讓欄位選擇器「真的跟 colOrder 同步」
  colOrder.forEach(k => {
    const c = COLS.find(x => x.key === k);
    if (!c) return;

    const div = document.createElement("div");
    div.className = "colItem";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = visibleCols.includes(k);
    cb.onchange = () => {
      visibleCols = cb.checked
        ? Array.from(new Set([...visibleCols, k]))
        : visibleCols.filter(x => x !== k);
      saveJSON(LS.cols, visibleCols);
      applyFilter();
    };

    const star = document.createElement("span");
    star.className = "star";
    const pinned = pinnedCols.includes(k);
    star.textContent = pinned ? "⭐" : "☆";
    star.onclick = () => {
      pinnedCols = pinned
        ? pinnedCols.filter(x => x !== k)
        : Array.from(new Set([...pinnedCols, k]));
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
    up.onclick = () => moveCol(k, -1);

    const dn = document.createElement("button");
    dn.type = "button";
    dn.className = "moveBtn";
    dn.textContent = "▼";
    dn.title = "下移";
    dn.onclick = () => moveCol(k, 1);

    moves.appendChild(up);
    moves.appendChild(dn);
    div.appendChild(moves);

    box.appendChild(div);
  });

  const sel = el("selSortKey");
  sel.innerHTML = "";
  COLS.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.label;
    sel.appendChild(opt);
  });
  sel.value = sortKey;
  el("selSortDir").value = sortDir;
}

function sortData(arr) {
  const dir = sortDir === "asc" ? 1 : -1;
  const k = sortKey;
  return arr.slice().sort((a, b) => {
    const av = a[k];
    const bv = b[k];
    if (av === null || av === undefined || av === "") return 1;
    if (bv === null || bv === undefined || bv === "") return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv), "zh-Hant") * dir;
  });
}

// ✅ watchlist 混用：4碼(issuer_code) 或 5碼以上(bond_code)
function applyFilter() {
  const s4 = new Set();
  const s5 = new Set();

  watch.forEach(raw => {
    const c = String(raw || "").trim();
    if (/^\d{4}$/.test(c)) s4.add(c);
    else if (/^\d{5,}$/.test(c)) s5.add(c);
  });

  const noWl = (s4.size === 0 && s5.size === 0);

  dataView = dataAll.filter(r => {
    if (noWl) return true;
    const bc = String(r["bond_code"] ?? "");
    const ic = String(r["issuer_code"] ?? "");
    return s5.has(bc) || s4.has(ic);
  });

  dataView = sortData(dataView);
  renderTable();
  renderCards();
  el("status").textContent = `資料筆數：${dataAll.length}｜顯示：${dataView.length}｜Watchlist：${watch.length}`;
}

function renderTable() {
  const tbl = el("tbl");
  ensureColOrder();

  const cols = colOrder.filter(k => visibleCols.includes(k) || pinnedCols.includes(k));
  const colDefs = cols.map(k => COLS.find(c => c.key === k)).filter(Boolean);

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  colDefs.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.label;
    th.style.cursor = "pointer";
    th.onclick = () => {
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
  dataView.forEach(r => {
    const tr = document.createElement("tr");
    colDefs.forEach(c => {
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

function colLabel(key) {
  const c = COLS.find(x => x.key === key);
  return c ? c.label : key;
}
function fmtCell(v) {
  const s = fmt(v);
  return s === "" ? "—" : s;
}

function renderCards() {
  const box = el("cardList");
  if (!box) return;

  ensureColOrder();

  // 卡片標題/副標固定用：短名 + 代號 + 完整名
  // 其餘欄位按「勾選/釘選/順序」顯示
  const keys = colOrder.filter(k =>
    (visibleCols.includes(k) || pinnedCols.includes(k)) &&
    !["可轉債短名", "可轉債名稱", "bond_code"].includes(k)
  );

  box.innerHTML = "";
  dataView.forEach(r => {
    const card = document.createElement("div");
    card.className = "bondCard";

    const head = document.createElement("div");
    head.className = "bondCardHeader";

    const left = document.createElement("div");
    const shortName = String(r["可轉債短名"] ?? "");
    const code = String(r["bond_code"] ?? "");
    const fullName = String(r["可轉債名稱"] ?? "");
    left.innerHTML =
      `<div class="bondTitle">${shortName || code}</div>` +
      `<div class="bondSub">${code}${fullName ? "｜" + fullName : ""}</div>`;

    const right = document.createElement("div");
    right.className = "badges";

    const addBadge = (label, val) => {
      if (val === null || val === undefined || val === "") return;
      const b = document.createElement("div");
      b.className = "badge";
      b.textContent = `${label}: ${val}`;
      right.appendChild(b);
    };

    // thefew 常看的：CB / 溢價 / Stock
    addBadge("CB", fmtCell(r["最新CB收盤價"]));
    addBadge("溢價", fmtCell(r["轉換溢價率"]));
    addBadge("Stock", fmtCell(r["最新股票收盤價"]));

    head.appendChild(left);
    head.appendChild(right);

    const grid = document.createElement("div");
    grid.className = "kvGrid";

    keys.forEach(k => {
      const kv = document.createElement("div");
      kv.className = "kv";
      kv.innerHTML =
        `<div class="k">${colLabel(k)}</div>` +
        `<div class="v">${fmtCell(r[k])}</div>`;
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
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}${t}`;
 

  const res = await fetch(url, { cache: cacheBust ? "no-store" : "default" });
  if (!res.ok) throw new Error(`下載失敗：${res.status} ${res.statusText}`);

  const buf = await res.arrayBuffer();
  if (!("DecompressionStream" in window)) {
    throw new Error("你的瀏覽器不支援 gzip 解壓（DecompressionStream）。建議用 Chrome/Edge 或更新 iOS/Android。");
  }

  const ds = new DecompressionStream("gzip");
  const decompressedStream = new Response(new Blob([buf]).stream().pipeThrough(ds));
  const text = await decompressedStream.text();

  // 雙保險（雖然我們後台已經 allow_nan=False）
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
    dataAll = Array.isArray(payload) ? payload : [];
    applyFilter();
  } catch (e) {
    console.error(e);
    el("status").textContent = `錯誤：${e.message}`;
  }
}

function wire() {
  el("btnAdd").onclick = () => {
    const v = el("inpAdd").value.trim();
    if (!v) return;

    // 允許 4碼或5碼以上
    if (!/^\d{4}$/.test(v) && !/^\d{5,}$/.test(v)) {
      el("status").textContent = "代號格式請輸入：股票 4 碼 或 可轉債 5 碼以上";
      return;
    }

    if (!watch.includes(v)) watch.push(v);
    saveJSON(LS.watch, watch);
    el("inpAdd").value = "";
    renderWatch();
    applyFilter();
  };

  el("btnRefresh").onclick = () => refresh(true);

  el("btnApplySort").onclick = () => {
    sortKey = el("selSortKey").value;
    sortDir = el("selSortDir").value;
    localStorage.setItem(LS.sortKey, sortKey);
    localStorage.setItem(LS.sortDir, sortDir);
    applyFilter();
  };

  const dlg = el("dlgSettings");
  el("btnSettings").onclick = () => {
    el("inpApiKey").value = localStorage.getItem(LS.apiKey) || "";
    el("inpFileId").value = localStorage.getItem(LS.fileId) || "";
    dlg.showModal();
  };
  el("btnSave").onclick = () => {
    localStorage.setItem(LS.apiKey, el("inpApiKey").value.trim());
    localStorage.setItem(LS.fileId, el("inpFileId").value.trim());
  };

  renderWatch();
  renderChooser();
  applyFilter();
}
wire();
