"use strict";
// ==========================================
// 🐦 Fake Tweet Webメーカー — 描画ロジック中核
// X ダークモード風カードの描画に必要な純ロジックを、DOM に触れない形で
// 集めたモジュール。ブラウザでは app.js の前に読み込まれて
// グローバル `NisetsuiCore` になり、Node ではテストから require される。
// Canvas の生成だけは呼び出し側が factory として渡す
// （ブラウザ: document.createElement / テスト: ヘッドレス Canvas 実装）。
// ==========================================

var NisetsuiCore = (function () {

  // ==========================================
  // 📐 1. レイアウト定数
  // ==========================================
  var IMAGE_WIDTH = 1200;

  var BG = "#000000"; // X ダークモードの背景
  var BORDER = "#2f3336"; // カードと区切り線の色
  var TEXT = "#e7e9ea"; // 本文・表示名
  var GRAY = "#71767b"; // @名・時刻・カウント

  var CARD_MARGIN = 20;
  var CARD_RADIUS = 24;
  var PAD = 48;
  var CONTENT_X = CARD_MARGIN + PAD;
  var CONTENT_W = IMAGE_WIDTH - (CARD_MARGIN + PAD) * 2;

  var AVATAR_SIZE = 96;
  var NAME_SIZE = 40;
  var USER_SIZE = 33;
  var BODY_SIZE = 44;
  var BODY_LINE_HEIGHT = 62;
  var MAX_BODY_LINES = 12;
  var TIME_SIZE = 32;
  var TIME_H = 44;
  var COUNT_SIZE = 31;
  var COUNTS_H = 46;
  var ICON_SIZE = 40;

  var FONT_REGULAR = "NotoJP";
  var FONT_BOLD = "NotoJPBold";

  var DEFAULT_COUNTS = { replies: 2, retweets: 9, likes: 37, views: 1204 };
  var MAX_TEXT_LENGTH = 300;

  // ==========================================
  // 🔢 2. フォーマット
  // ==========================================
  // 🔢 数を X 式（万・億）に整形する
  function formatCount(n) {
    if (!Number.isFinite(n) || n < 0) return "0";
    var v = Math.floor(n);
    if (v < 10000) return v.toLocaleString("ja-JP");
    if (v < 100000000) {
      var man = v / 10000;
      var s1 = man >= 10
        ? String(Math.round(man))
        : (Math.round(man * 10) / 10).toFixed(1).replace(/\.0$/, "");
      return s1 + "万";
    }
    var oku = v / 100000000;
    var s2 = oku >= 10
      ? String(Math.round(oku))
      : (Math.round(oku * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return s2 + "億";
  }

  // 🕐 日時をツイート表示形式にする（例: 午前9:05 · 2026年11月24日）
  function formatTweetTimestamp(date) {
    var parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).formatToParts(date);
    function pick(type) {
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) return parts[i].value;
      }
      return "";
    }
    return pick("dayPeriod") + pick("hour") + ":" + pick("minute") + " · " +
      pick("year") + "年" + pick("month") + "月" + pick("day") + "日";
  }

  // ==========================================
  // 📝 3. 文字列ヘルパと折り返し（禁則処理つき）
  // ==========================================
  var NO_LINE_START = "、。，．！？：；）」』】〉》ー〜…‥・ゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ";
  var NO_LINE_END = "（「『【〈《";

  // 🔤 末尾の1文字（コードポイント）を返す
  function lastCodePoint(text) {
    var chars = Array.from(text);
    return chars[chars.length - 1];
  }

  // 🔤 末尾の1文字（コードポイント）を除く
  function dropLastCodePoint(text) {
    var chars = Array.from(text);
    chars.pop();
    return chars.join("");
  }

  // 🔤 文字数を数える（サロゲートペア対応）
  function codePointLength(text) {
    return Array.from(text).length;
  }

  // 📝 禁則処理つきで折り返す。measure は文字列幅を返す関数
  function wrapText(text, maxWidth, measure) {
    var lines = [];
    var paragraphs = text.split(/\r?\n/);
    for (var p = 0; p < paragraphs.length; p++) {
      var paragraph = paragraphs[p];
      if (paragraph === "") {
        lines.push("");
        continue;
      }
      var line = "";
      var chars = Array.from(paragraph);
      for (var i = 0; i < chars.length; i++) {
        var ch = chars[i];
        if (line === "") {
          // 行頭の空白（半角・全角）は読み飛ばす
          if (ch === " " || ch === "　") continue;
          line = ch;
          continue;
        }
        if (measure(line + ch) <= maxWidth) {
          line += ch;
          continue;
        }
        // 行頭禁則文字は幅を超えても前の行にぶら下げる
        if (NO_LINE_START.indexOf(ch) >= 0) {
          line += ch;
          continue;
        }
        // 行末禁則文字は次の行へ送る
        var last = lastCodePoint(line);
        if (last !== undefined && NO_LINE_END.indexOf(last) >= 0 && codePointLength(line) >= 2) {
          lines.push(dropLastCodePoint(line));
          line = last + ch;
          continue;
        }
        lines.push(line);
        line = (ch === " " || ch === "　") ? "" : ch;
      }
      if (line !== "" || lines.length === 0) lines.push(line);
    }
    return lines;
  }

  // ✂️ 幅に収まるよう末尾を「…」で切る
  function truncateToWidth(text, maxWidth, measure) {
    if (measure(text) <= maxWidth) return text;
    var s = text;
    while (s.length > 0 && measure(s + "…") > maxWidth) s = dropLastCodePoint(s);
    return s + "…";
  }

  // ✂️ 本文行数が上限を超えたら、最終行を「…」で締めて切り詰める
  function clampBodyLines(lines, maxWidth, measure) {
    if (lines.length <= MAX_BODY_LINES) return lines;
    var kept = lines.slice(0, MAX_BODY_LINES);
    var last = kept[MAX_BODY_LINES - 1];
    while (last.length > 0 && measure(last + "…") > maxWidth) last = dropLastCodePoint(last);
    kept[MAX_BODY_LINES - 1] = last + "…";
    return kept;
  }

  // 📐 本文行数から画像の高さを決める
  function computeImageHeight(lineCount) {
    var contentH = PAD + AVATAR_SIZE + 30 +
      lineCount * BODY_LINE_HEIGHT + 30 +
      TIME_H + 22 + 2 + 20 + COUNTS_H + PAD;
    return CARD_MARGIN * 2 + contentH;
  }

  // ==========================================
  // 🖌️ 4. 描画ヘルパ（角丸・アイコン）
  // ==========================================
  // 🖌️ 角丸矩形のパスを作る
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  // 💬 返信アイコンを描く（40×40 基準、左上が x, y）
  function drawReplyIcon(ctx, x, y) {
    roundRectPath(ctx, x + 4, y + 5, 32, 24, 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 13, y + 29);
    ctx.lineTo(x + 13, y + 38);
    ctx.lineTo(x + 24, y + 29);
    ctx.stroke();
  }

  // 🔁 リポストアイコンを描く
  function drawRetweetIcon(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 11);
    ctx.lineTo(x + 31, y + 11);
    ctx.moveTo(x + 24, y + 4);
    ctx.lineTo(x + 32, y + 11);
    ctx.lineTo(x + 24, y + 18);
    ctx.moveTo(x + 31, y + 11);
    ctx.lineTo(x + 31, y + 21);
    ctx.moveTo(x + 33, y + 29);
    ctx.lineTo(x + 9, y + 29);
    ctx.moveTo(x + 16, y + 22);
    ctx.lineTo(x + 8, y + 29);
    ctx.lineTo(x + 16, y + 36);
    ctx.moveTo(x + 9, y + 29);
    ctx.lineTo(x + 9, y + 19);
    ctx.stroke();
  }

  // ❤️ いいねアイコンを描く
  function drawHeartIcon(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 34);
    ctx.bezierCurveTo(x + 20, y + 30, x + 2, y + 19, x + 2, y + 11);
    ctx.bezierCurveTo(x + 2, y + 3, x + 9, y + 1, x + 13, y + 4);
    ctx.bezierCurveTo(x + 17, y + 6, x + 20, y + 10, x + 20, y + 13);
    ctx.bezierCurveTo(x + 20, y + 10, x + 23, y + 6, x + 27, y + 4);
    ctx.bezierCurveTo(x + 31, y + 1, x + 38, y + 3, x + 38, y + 11);
    ctx.bezierCurveTo(x + 38, y + 19, x + 20, y + 30, x + 20, y + 34);
    ctx.stroke();
  }

  // 📊 表示数アイコンを描く
  function drawViewsIcon(ctx, x, y) {
    var base = y + 36;
    var bars = [[6, 12], [15, 21], [24, 9], [33, 27]];
    for (var i = 0; i < bars.length; i++) {
      ctx.fillRect(x + bars[i][0], base - bars[i][1], 5, bars[i][1]);
    }
  }

  // ==========================================
  // 🎨 5. 描画本体
  // ==========================================
  // 🎨 ツイート画像を描いて返す
  // input: { text, displayName, username, date: Date,
  //          counts: {replies, retweets, likes, views}, avatar: Image|Canvas }
  // createCanvas: (width, height) => canvas
  // 戻り値: canvas（幅1200、高さは本文行数に応じて可変）
  function renderTweetImage(input, createCanvas) {
    var counts = {};
    var k;
    for (k in DEFAULT_COUNTS) counts[k] = DEFAULT_COUNTS[k];
    if (input.counts) {
      for (k in input.counts) {
        if (input.counts[k] != null) counts[k] = input.counts[k];
      }
    }

    var probe = createCanvas(1, 1).getContext("2d");
    probe.font = BODY_SIZE + 'px "' + FONT_REGULAR + '"';
    function measure(s) { return probe.measureText(s).width; }
    var lines = clampBodyLines(wrapText(input.text, CONTENT_W, measure), CONTENT_W, measure);

    var height = computeImageHeight(lines.length);
    var canvas = createCanvas(IMAGE_WIDTH, height);
    var ctx = canvas.getContext("2d");

    // 🃏 カード地（角丸＋枠線）
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, IMAGE_WIDTH, height);
    roundRectPath(ctx, CARD_MARGIN, CARD_MARGIN,
      IMAGE_WIDTH - CARD_MARGIN * 2, height - CARD_MARGIN * 2, CARD_RADIUS);
    ctx.fillStyle = BG;
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    ctx.stroke();

    var top = CARD_MARGIN + PAD;

    // 🖼️ アバター（円形クリップ + cover 切り抜き）
    var ax = CONTENT_X;
    var ay = top;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + AVATAR_SIZE / 2, ay + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    var img = input.avatar;
    var iw = img.width || img.naturalWidth;
    var ih = img.height || img.naturalHeight;
    var scale = Math.max(AVATAR_SIZE / iw, AVATAR_SIZE / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    ctx.drawImage(img, ax + (AVATAR_SIZE - dw) / 2, ay + (AVATAR_SIZE - dh) / 2, dw, dh);
    ctx.restore();

    // 🏷️ 表示名（太字）と @ユーザー名（はみ出す場合は「…」で切る）
    var nameX = ax + AVATAR_SIZE + 24;
    var nameMaxW = CONTENT_X + CONTENT_W - nameX;
    ctx.textAlign = "left";
    ctx.font = NAME_SIZE + 'px "' + FONT_BOLD + '"';
    ctx.fillStyle = TEXT;
    var name = truncateToWidth(input.displayName, nameMaxW, function (s) {
      return ctx.measureText(s).width;
    });
    ctx.fillText(name, nameX, top + 44);
    ctx.font = USER_SIZE + 'px "' + FONT_REGULAR + '"';
    ctx.fillStyle = GRAY;
    var uname = truncateToWidth("@" + input.username, nameMaxW, function (s) {
      return ctx.measureText(s).width;
    });
    ctx.fillText(uname, nameX, top + 44 + 46);

    top += AVATAR_SIZE + 30;

    // 📝 本文
    ctx.font = BODY_SIZE + 'px "' + FONT_REGULAR + '"';
    ctx.fillStyle = TEXT;
    lines.forEach(function (line, i) {
      ctx.fillText(line, CONTENT_X, top + 46 + i * BODY_LINE_HEIGHT);
    });
    top += lines.length * BODY_LINE_HEIGHT + 30;

    // 🕐 時刻
    ctx.font = TIME_SIZE + 'px "' + FONT_REGULAR + '"';
    ctx.fillStyle = GRAY;
    ctx.fillText(formatTweetTimestamp(input.date), CONTENT_X, top + 34);
    top += TIME_H + 22;

    // ➖ 区切り線
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CONTENT_X, top);
    ctx.lineTo(CONTENT_X + CONTENT_W, top);
    ctx.stroke();
    top += 2 + 20;

    // 🔢 カウント行（アイコン＋整形済み数値）
    var items = [
      { draw: drawReplyIcon, value: counts.replies },
      { draw: drawRetweetIcon, value: counts.retweets },
      { draw: drawHeartIcon, value: counts.likes },
      { draw: drawViewsIcon, value: counts.views }
    ];
    var groupW = CONTENT_W / items.length;
    ctx.font = COUNT_SIZE + 'px "' + FONT_REGULAR + '"';
    items.forEach(function (item, i) {
      var gx = CONTENT_X + i * groupW;
      ctx.strokeStyle = GRAY;
      ctx.fillStyle = GRAY;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      item.draw(ctx, gx, top + 3);
      ctx.fillText(formatCount(item.value), gx + ICON_SIZE + 12, top + 34);
    });

    return canvas;
  }

  // ==========================================
  // 🖼️ 6. 代替アバター（表示名からの自動生成）
  // ==========================================
  // 🎲 表示名から代替アバターの色と頭文字を決める（ハッシュで決定的）
  function fallbackAvatarSpec(displayName) {
    var chars = Array.from(displayName);
    var hash = 0;
    for (var i = 0; i < chars.length; i++) {
      hash = (hash * 31 + chars[i].codePointAt(0)) % 360;
    }
    return {
      hue: hash,
      hue2: (hash + 40) % 360,
      initial: chars[0] || "?"
    };
  }

  // 🖼️ アバター未指定時に使う 630×630 の代替画像を描く
  function fallbackAvatar(displayName, createCanvas) {
    var size = 630;
    var spec = fallbackAvatarSpec(displayName);
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    var grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "hsl(" + spec.hue + ", 32%, 30%)");
    grad.addColorStop(1, "hsl(" + spec.hue2 + ", 36%, 16%)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(245,243,236,0.92)";
    ctx.font = '300px "' + FONT_REGULAR + '"';
    var w = ctx.measureText(spec.initial).width;
    ctx.fillText(spec.initial, (size - w) / 2, size / 2 + 108);
    return canvas;
  }

  // ==========================================
  // 🧩 7. 入力の正規化
  // ==========================================
  // 🏷️ ユーザー名を正規化する（前後の空白と先頭の @ を取り除く）
  function normalizeUsername(raw) {
    return String(raw == null ? "" : raw).trim().replace(/^@+/, "");
  }

  // 🔢 カウント欄の文字列を読む（空欄・不正値・負数は既定値）
  function parseCountValue(raw, fallback) {
    if (raw == null || String(raw).trim() === "") return fallback;
    var n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
  }

  // 🔍 Discord アイコン画像の URL を作る
  // avatar があればその画像、無ければ discriminator / ID から既定アイコンを選ぶ
  function discordAvatarUrl(user, size) {
    if (user.avatar) {
      return "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar +
        ".png?size=" + size;
    }
    var idx;
    if (!user.discriminator || user.discriminator === "0") {
      idx = Number((BigInt(user.id) >> 22n) % 6n);
    } else {
      idx = parseInt(user.discriminator, 10) % 5;
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  return {
    IMAGE_WIDTH: IMAGE_WIDTH,
    BG: BG,
    BORDER: BORDER,
    TEXT: TEXT,
    GRAY: GRAY,
    CARD_MARGIN: CARD_MARGIN,
    CARD_RADIUS: CARD_RADIUS,
    PAD: PAD,
    CONTENT_X: CONTENT_X,
    CONTENT_W: CONTENT_W,
    AVATAR_SIZE: AVATAR_SIZE,
    NAME_SIZE: NAME_SIZE,
    USER_SIZE: USER_SIZE,
    BODY_SIZE: BODY_SIZE,
    BODY_LINE_HEIGHT: BODY_LINE_HEIGHT,
    MAX_BODY_LINES: MAX_BODY_LINES,
    TIME_SIZE: TIME_SIZE,
    COUNT_SIZE: COUNT_SIZE,
    ICON_SIZE: ICON_SIZE,
    FONT_REGULAR: FONT_REGULAR,
    FONT_BOLD: FONT_BOLD,
    DEFAULT_COUNTS: DEFAULT_COUNTS,
    MAX_TEXT_LENGTH: MAX_TEXT_LENGTH,
    formatCount: formatCount,
    formatTweetTimestamp: formatTweetTimestamp,
    lastCodePoint: lastCodePoint,
    dropLastCodePoint: dropLastCodePoint,
    codePointLength: codePointLength,
    wrapText: wrapText,
    truncateToWidth: truncateToWidth,
    clampBodyLines: clampBodyLines,
    computeImageHeight: computeImageHeight,
    roundRectPath: roundRectPath,
    drawReplyIcon: drawReplyIcon,
    drawRetweetIcon: drawRetweetIcon,
    drawHeartIcon: drawHeartIcon,
    drawViewsIcon: drawViewsIcon,
    renderTweetImage: renderTweetImage,
    fallbackAvatarSpec: fallbackAvatarSpec,
    fallbackAvatar: fallbackAvatar,
    normalizeUsername: normalizeUsername,
    parseCountValue: parseCountValue,
    discordAvatarUrl: discordAvatarUrl
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = NisetsuiCore;
}
