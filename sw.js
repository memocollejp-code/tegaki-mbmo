/* =====================================================
 * てがきメモ Service Worker
 * - キャッシュ名は登録URLの ?v=バージョン から自動生成される
 *   （index.html側の APP_VERSION を上げるだけで、
 *     新しいキャッシュへ確実に切り替わる）
 * - install時に skipWaiting、activate時に clients.claim
 *   → ユーザー操作なしで新バージョンが即座に有効化される
 *   （index.html側の controllerchange 検知で自動リロードされる）
 * - fetchはネットワーク優先（オンライン時は常に最新を取得し、
 *   同時にキャッシュを更新／オフライン時のみキャッシュから応答）
 * ===================================================== */

/* 登録時に付与された ?v=xxx を自分自身のURLから読み取り、
   キャッシュ名に反映する＝バージョン管理の一元化 */
const urlParams = new URLSearchParams(self.location.search);
const APP_VERSION = urlParams.get("v") || "dev";
const CACHE_NAME = "tegaki-memo-cache-" + APP_VERSION;

/* アプリの起動に最低限必要なファイル（シェル） */
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

/* ---------- install：新バージョンを即座にキャッシュし、即座に有効化準備 ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())   // 待機せず即座にactivateへ進む
  );
});

/* ---------- activate：古いバージョンのキャッシュを一掃し、即座に全タブを制御下に ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("tegaki-memo-cache-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())   // 既存タブも即座に新SWの制御下へ
  );
});

/* ---------- fetch：ネットワーク優先＋キャッシュフォールバック ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET以外（POST等）はSWを介さずそのまま素通し
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // 正常なレスポンスはキャッシュへ複製保存（次回オフライン時の備え）
        if (networkRes && networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return networkRes;
      })
      .catch(async () => {
        // オフライン・通信失敗時はキャッシュから返す
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        // ナビゲーション要求（画面遷移）でキャッシュも無い場合はトップページを返す
        if (req.mode === "navigate") {
          const fallback = await caches.match("./index.html", { ignoreSearch: true });
          if (fallback) return fallback;
        }
        return new Response("オフラインのため読み込めませんでした。", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});
