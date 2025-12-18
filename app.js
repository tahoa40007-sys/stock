const LS = {
  apiKey: "cb_apiKey",
  fileId: "cb_fileId",
  watch: "cb_watchlist",
  cols: "cb_cols_visible",
  pins: "cb_cols_pinned",
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
  el("status").textContent = `資料筆數：${dataAll.length}｜顯示：${dataView.length}｜Watchlist：${watch.length}`;
}

function renderTable(){
  const tbl = el("tbl");
  const cols = [...new Set([...pinnedCols, ...visibleCols])].filter(k=>visibleCols.includes(k) || pinnedCols.includes(k));
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

async function fetchDriveGzipJson(apiKey, fileId){
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載失敗：${res.status} ${res.statusText}`);
  const buf = await res.arrayBuffer();

  if (!("DecompressionStream" in window)) {
    throw new Error("你的瀏覽器不支援 gzip 解壓（DecompressionStream）。建議用 Chrome/Edge 或更新 iOS/Android 版本。");
  }
  const ds = new DecompressionStream("gzip");
  const decompressedStream = new Response(new Blob([buf]).stream().pipeThrough(ds));
  const text = await decompressedStream.text();
  return JSON.parse(text);
}

async function refresh(){
  const apiKey = localStorage.getItem(LS.apiKey) || "";
  const fileId = localStorage.getItem(LS.fileId) || "";
  if (!apiKey || !fileId){
    el("status").textContent = "請先點『資料來源』設定 API key / file id";
    return;
  }
  el("status").textContent = "下載中...";
  try{
    const payload = await fetchDriveGzipJson(apiKey, fileId);
    dataAll = payload;
    applyFilter();
  }catch(e){
    console.error(e);
    el("status").textContent = `錯誤：${e.message}`;
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

  el("btnRefresh").onclick = refresh;

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
    dlg.showModal();
  };
  el("btnSave").onclick = ()=>{
    localStorage.setItem(LS.apiKey, el("inpApiKey").value.trim());
    localStorage.setItem(LS.fileId, el("inpFileId").value.trim());
  };

  renderWatch();
  renderChooser();
  applyFilter();
}
wire();
