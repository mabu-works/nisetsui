"use strict";
// ==========================================
// 🐦 Fake Tweet Webメーカー — 画面配線
// 描画の純ロジックは js/render-core.js（NisetsuiCore）に分離してある。
// すべてクライアントサイドで処理し、入力内容はサーバーに送信しない
// （隠し機能の Discord アイコン取得を使う場合のみ、ユーザーIDが照会先APIに送られる）。
// ==========================================

var Core = NisetsuiCore;

// 🖼️ Canvas 生成 factory（render-core へ渡す）
function createCanvas(width, height) {
  var c = document.createElement("canvas");
  if (width) c.width = width;
  if (height) c.height = height;
  return c;
}

// ==========================================
// 🔤 1. フォント
// ==========================================
var fontsPromise = null;
// 🔤 描画用フォント（同梱の Noto Sans JP）を読み込む
function ensureFonts() {
  if (fontsPromise) return fontsPromise;
  var regular = new FontFace("NotoJP", 'url("fonts/NotoSansJP-Regular.ttf")');
  var bold = new FontFace("NotoJPBold", 'url("fonts/NotoSansJP-Bold.ttf")');
  fontsPromise = Promise.all([
    regular.load().then(function (f) { document.fonts.add(f); }),
    bold.load().then(function (f) { document.fonts.add(f); })
  ]);
  return fontsPromise;
}

// ==========================================
// 🧩 2. UI 状態と要素
// ==========================================
var els = {};
var state = {
  avatarImage: null,
  avatarObjectUrl: null,
  generated: false,
  downloadUrl: null
};

// 🧩 要素を id で取得する
function $(id) { return document.getElementById(id); }

// 💬 ステータス表示を更新する
function setStatus(msg, isError) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", !!isError);
}

// 🔢 文字数カウンタを更新し、上限内かどうかを返す
function updateCharCount() {
  var len = Core.codePointLength(els.tweetText.value);
  els.charCount.textContent = String(len);
  var over = len > Core.MAX_TEXT_LENGTH;
  els.charWarn.hidden = !over;
  els.charCount.parentElement.classList.toggle("over", over);
  return !over;
}

// ==========================================
// 🖼️ 3. アバター入力
// ==========================================
// 🖼️ アバタープレビューの頭文字を更新する（画像未設定時のみ）
function updateAvatarPreviewInitial() {
  if (state.avatarImage) return;
  var name = els.displayName.value.trim();
  var initial = name ? Array.from(name)[0] : "？";
  els.avatarPreviewInitial.textContent = initial;
  els.avatarPreview.style.display = "";
  var img = els.avatarPreview.querySelector("img");
  if (img) img.remove();
}

// 🖼️ アバター画像を設定する
function setAvatarImage(img, fileName) {
  state.avatarImage = img;
  els.clearAvatarBtn.disabled = false;
  els.avatarFileName.textContent = fileName || "選択済み";
  var prevImg = els.avatarPreview.querySelector("img");
  if (prevImg) prevImg.remove();
  if (img && img.tagName === "IMG") {
    var clone = document.createElement("img");
    clone.src = img.src;
    clone.alt = "";
    els.avatarPreview.appendChild(clone);
    els.avatarPreviewInitial.style.display = "none";
  }
}

// 🖼️ アバター画像を消してプレースホルダに戻す
function clearAvatar() {
  state.avatarImage = null;
  if (state.avatarObjectUrl) {
    URL.revokeObjectURL(state.avatarObjectUrl);
    state.avatarObjectUrl = null;
  }
  els.avatarInput.value = "";
  els.clearAvatarBtn.disabled = true;
  els.avatarFileName.textContent = "未選択（プレースホルダ使用）";
  var img = els.avatarPreview.querySelector("img");
  if (img) img.remove();
  els.avatarPreviewInitial.style.display = "";
  updateAvatarPreviewInitial();
}

// 📂 アバター画像ファイルを受け取って読み込む
function loadAvatarFile(file) {
  if (!file) return;
  if (!file.type || file.type.indexOf("image/") !== 0) {
    setStatus("画像ファイルを選択してください。", true);
    return;
  }
  if (state.avatarObjectUrl) URL.revokeObjectURL(state.avatarObjectUrl);
  var url = URL.createObjectURL(file);
  state.avatarObjectUrl = url;
  var img = new Image();
  img.onload = function () {
    setAvatarImage(img, file.name);
    setStatus("アバター画像を読み込みました。「画像を生成」を押してください。", false);
  };
  img.onerror = function () {
    setStatus("画像の読み込みに失敗しました。別のファイルで試してください。", true);
  };
  img.src = url;
}

// ==========================================
// 🎨 4. 生成
// ==========================================
// 🔢 カウント欄の数値を読む（空欄・不正値は既定値）
function parseCount(input, fallback) {
  return Core.parseCountValue(input ? input.value : "", fallback);
}

// 🎨 ツイート画像を生成して表示する
async function generate() {
  var ok = updateCharCount();
  var text = els.tweetText.value;
  if (!text.trim()) {
    setStatus("本文を入力してください。", true);
    els.tweetText.focus();
    return;
  }
  if (!ok) {
    setStatus("本文は300文字以内にしてください。", true);
    return;
  }
  var displayName = els.displayName.value.trim();
  if (!displayName) {
    setStatus("表示名を入力してください。", true);
    els.displayName.focus();
    return;
  }
  var username = Core.normalizeUsername(els.username.value);
  if (!username) {
    setStatus("ユーザー名を入力してください。", true);
    els.username.focus();
    return;
  }
  els.generateBtn.disabled = true;
  try {
    await ensureFonts();
    var date = els.tweetDate.value ? new Date(els.tweetDate.value) : new Date();
    if (isNaN(date.getTime())) date = new Date();
    var avatar = state.avatarImage || Core.fallbackAvatar(displayName, createCanvas);
    var rendered = Core.renderTweetImage({
      text: text,
      displayName: displayName,
      username: username,
      date: date,
      counts: {
        replies: parseCount(els.cntReplies, Core.DEFAULT_COUNTS.replies),
        retweets: parseCount(els.cntRetweets, Core.DEFAULT_COUNTS.retweets),
        likes: parseCount(els.cntLikes, Core.DEFAULT_COUNTS.likes),
        views: parseCount(els.cntViews, Core.DEFAULT_COUNTS.views)
      },
      avatar: avatar
    }, createCanvas);
    var ctx = els.canvas.getContext("2d");
    els.canvas.width = rendered.width;
    els.canvas.height = rendered.height;
    ctx.drawImage(rendered, 0, 0);
    els.emptyHint.style.display = "none";
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = null;
    els.canvas.toBlob(function (blob) {
      if (!blob) return;
      state.downloadUrl = URL.createObjectURL(blob);
      els.downloadBtn.href = state.downloadUrl;
      els.downloadBtn.classList.remove("disabled");
      els.downloadBtn.setAttribute("aria-disabled", "false");
    }, "image/png");
    state.generated = true;
    els.regenerateBtn.disabled = false;
    setStatus("生成しました。PNGをダウンロードできます。", false);
  } catch (err) {
    console.error(err);
    setStatus("生成に失敗しました: " + (err && err.message ? err.message : err), true);
  } finally {
    els.generateBtn.disabled = false;
  }
}

// 🔢 数値を2桁の文字列にする
function pad2(n) { return String(n).padStart(2, "0"); }

// 🕐 日時欄を現在時刻にする
function setDateToNow() {
  var now = new Date();
  els.tweetDate.value =
    now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()) +
    "T" + pad2(now.getHours()) + ":" + pad2(now.getMinutes());
}

// 📝 サンプル内容を入力して生成する
function fillSample() {
  els.displayName.value = "まぶ";
  els.username.value = "xx_mabu_xx";
  els.tweetText.value = "新しいWebメーカーを作りました。ブラウザだけでツイート風の画像が作れます";
  els.cntReplies.value = "12";
  els.cntRetweets.value = "48";
  els.cntLikes.value = "326";
  els.cntViews.value = "15234";
  setDateToNow();
  updateCharCount();
  updateAvatarPreviewInitial();
  generate();
}

// 🚀 画面の要素取得とイベント配線を行う
function init() {
  els.dropZone = $("dropZone");
  els.avatarInput = $("avatarInput");
  els.avatarPreview = $("avatarPreview");
  els.avatarPreviewInitial = $("avatarPreviewInitial");
  els.clearAvatarBtn = $("clearAvatarBtn");
  els.avatarFileName = $("avatarFileName");
  els.displayName = $("displayName");
  els.username = $("username");
  els.tweetText = $("tweetText");
  els.tweetDate = $("tweetDate");
  els.cntReplies = $("cntReplies");
  els.cntRetweets = $("cntRetweets");
  els.cntLikes = $("cntLikes");
  els.cntViews = $("cntViews");
  els.charCount = $("charCount");
  els.charWarn = $("charWarn");
  els.sampleBtn = $("sampleBtn");
  els.generateBtn = $("generateBtn");
  els.regenerateBtn = $("regenerateBtn");
  els.downloadBtn = $("downloadBtn");
  els.canvas = $("tweetCanvas");
  els.emptyHint = $("emptyHint");
  els.status = $("statusMsg");

  // 初期表示は背景色で塗っておく
  var ctx = els.canvas.getContext("2d");
  ctx.fillStyle = Core.BG;
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);

  // 📂 アバターのドロップゾーン（クリック・キー・ドラッグ＆ドロップ）
  els.dropZone.addEventListener("click", function () { els.avatarInput.click(); });
  els.dropZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.avatarInput.click();
    }
  });
  els.avatarInput.addEventListener("change", function () {
    loadAvatarFile(els.avatarInput.files && els.avatarInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    els.dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    els.dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  });
  els.dropZone.addEventListener("drop", function (e) {
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    loadAvatarFile(file);
  });

  els.clearAvatarBtn.addEventListener("click", clearAvatar);
  els.displayName.addEventListener("input", updateAvatarPreviewInitial);
  els.tweetText.addEventListener("input", updateCharCount);
  els.generateBtn.addEventListener("click", generate);
  els.regenerateBtn.addEventListener("click", generate);
  els.sampleBtn.addEventListener("click", fillSample);
  els.downloadBtn.addEventListener("click", function (e) {
    if (els.downloadBtn.classList.contains("disabled")) e.preventDefault();
  });

  setDateToNow();
  updateCharCount();
  updateAvatarPreviewInitial();
  initSecret();

  ensureFonts()
    .then(function () { setStatus("準備できました。入力して「画像を生成」を押してください。", false); })
    .catch(function (err) {
      console.error(err);
      setStatus("フォントの読み込みに失敗しました。再読み込みしてください。", true);
    });
}

// ==========================================
// 🔍 5. 隠し機能: Discord アイコン取得
// ==========================================
// 🔍 通常の画面には出ないパネル。出し方：(1) キーボードで「discord」と打つ
// (2) フッターのクレジットを2秒以内に5回タップ (3) URL パラメータ ?uid=<ユーザーID>
// ユーザー情報の照会には外部API (japi.rest) を使い、画像は Discord CDN から直接読み込む。
// 照会に送られるのは入力したユーザーIDだけ。

// 💬 隠しパネルのステータス表示を更新する
function setSecretStatus(msg, isError) {
  els.secretStatus.textContent = msg;
  els.secretStatus.classList.toggle("error", !!isError);
}

// 🔍 隠しパネルの表示を切り替える
function toggleSecretPanel(show) {
  var willShow = typeof show === "boolean" ? show : els.secretPanel.hidden;
  els.secretPanel.hidden = !willShow;
  if (willShow) els.secretUserId.focus();
}

// 🔍 Discord のユーザー情報を照会してアイコンを設定する
async function fetchDiscordAvatar() {
  var id = els.secretUserId.value.trim();
  if (!/^\d{17,20}$/.test(id)) {
    setSecretStatus("ユーザーIDは17〜20桁の数字で入力してください。", true);
    return;
  }
  els.secretFetchBtn.disabled = true;
  setSecretStatus("Discord のユーザー情報を照会中…", false);
  var data;
  try {
    var res = await fetch("https://japi.rest/discord/v1/user/" + id);
    var json = await res.json();
    data = json && json.data;
  } catch (e) {
    setSecretStatus("照会に失敗しました。通信環境を確認してもう一度お試しください。", true);
    els.secretFetchBtn.disabled = false;
    return;
  }
  if (!data || !data.id || data.message) {
    setSecretStatus("そのユーザーIDは見つかりませんでした。", true);
    els.secretFetchBtn.disabled = false;
    return;
  }
  var fullUrl = Core.discordAvatarUrl(data, 4096);
  var img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function () {
    setAvatarImage(img, "Discord: " + data.username);
    els.displayName.value = data.global_name || data.username || "";
    els.username.value = data.username || "";
    els.secretAvatarLink.href = fullUrl;
    els.secretLinks.hidden = false;
    setSecretStatus("「" + (data.global_name || data.username) + "」のアイコンを設定しました。表示名とユーザー名も反映しています。", false);
    setStatus("Discord のアイコンを読み込みました。「画像を生成」を押してください。", false);
    els.secretFetchBtn.disabled = false;
  };
  img.onerror = function () {
    setSecretStatus("アイコン画像の読み込みに失敗しました。", true);
    els.secretFetchBtn.disabled = false;
  };
  img.src = Core.discordAvatarUrl(data, 1024);
}

// 🔍 隠し機能の配線を行う
function initSecret() {
  els.secretPanel = $("secretPanel");
  els.secretUserId = $("secretUserId");
  els.secretFetchBtn = $("secretFetchBtn");
  els.secretStatus = $("secretStatus");
  els.secretLinks = $("secretLinks");
  els.secretAvatarLink = $("secretAvatarLink");

  els.secretFetchBtn.addEventListener("click", fetchDiscordAvatar);
  els.secretUserId.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchDiscordAvatar();
    }
  });

  // ⌨️ 「discord」と打つとパネルを開閉する（入力欄の中では反応しない）
  var seq = "";
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key && e.key.length === 1) {
      seq = (seq + e.key.toLowerCase()).slice(-7);
      if (seq === "discord") {
        toggleSecretPanel();
        seq = "";
      }
    }
  });

  // 👆 フッターのクレジットを2秒以内に5回タップでも開閉する
  var taps = [];
  var trigger = $("secretTrigger");
  if (trigger) {
    trigger.addEventListener("click", function () {
      var now = Date.now();
      taps = taps.filter(function (t) { return now - t < 2000; });
      taps.push(now);
      if (taps.length >= 5) {
        toggleSecretPanel();
        taps = [];
      }
    });
  }

  // 🔗 ?uid=<ユーザーID> があれば自動で照会する
  var uid = new URLSearchParams(location.search).get("uid");
  if (uid && /^\d{17,20}$/.test(uid)) {
    els.secretUserId.value = uid;
    toggleSecretPanel(true);
    fetchDiscordAvatar();
  }
}

// ==========================================
// 🌙 6. テーマ (ダーク/ライト)
// ==========================================
// 🌙 既定はダーク。<head> のインラインスクリプトが保存済みテーマを先に反映し、
// ここではトグルボタンの配線と、未保存時の data-theme 補完だけを行う。
// 保存キーは "nisetsui-theme"（他の保存データには触れない）。
(function initTheme() {
  var root = document.documentElement;
  if (!root || !root.getAttribute || !root.setAttribute) return;
  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  }
  var current = root.getAttribute("data-theme");
  if (current !== "light" && current !== "dark") {
    try { current = localStorage.getItem("nisetsui-theme"); } catch (e) { current = null; }
  }
  apply(current === "light" ? "light" : "dark");
  var btn = document.getElementById("themeToggle");
  if (btn && btn.addEventListener) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      apply(next);
      try { localStorage.setItem("nisetsui-theme", next); } catch (e) { /* 保存できなくても切り替え自体は有効 */ }
    });
  }
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
