# CB Watchlist PWA（GitHub Pages 版）

你已經把 `cb_snapshot_latest_all.json.gz` 上傳到 Google Drive 並設定「知道連結的人可檢視」✅  
這份 PWA 會透過 **Google Drive API** 下載該 .gz，解壓後在手機上做：
- Watchlist（新增/刪除）
- 欄位勾選顯示
- 欄位釘選（顯示在左側）
- 排序（下拉或點表頭）

---

## 1) 取得 Drive 檔案的 fileId
你的分享連結通常長這樣：
- https://drive.google.com/file/d/**FILEID**/view?usp=sharing

把中間那段 **FILEID** 複製出來即可。

---

## 2) 建 Google Drive API Key
Google Cloud Console：
1. Create Project（或用既有）
2. APIs & Services → Library → 啟用 **Google Drive API**
3. APIs & Services → Credentials → Create Credentials → **API key**

> 先不限制也可以（測試完再限制）。
> 之後可限制：API restrictions = Google Drive API；Application restrictions = HTTP referrers（填你的 GitHub Pages 網址）。

---

## 3) 部署到 GitHub Pages（最簡單）
1. 建一個 GitHub repo，例如 `cb-watch-pwa`
2. 把本資料夾中的檔案（index.html / app.js / styles.css / manifest.json）上傳到 repo 根目錄
3. Repo → Settings → Pages
   - Source: Deploy from a branch
   - Branch: main / root
4. GitHub 會給你網址：`https://<username>.github.io/<repo>/`

---

## 4) 手機使用
1. 手機開啟上面網址
2. 點「資料來源」填入：
   - Drive API Key
   - fileId（你的 .gz 檔案）
3. 按「更新資料」
4. Chrome / Safari →「加入主畫面」，就像 App 一樣。

