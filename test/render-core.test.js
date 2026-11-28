"use strict";
// ==========================================
// 🧪 nisetsui — 描画ロジック中核の単体テスト（node:test、依存なし）
// 実行: npm test
// ヘッドレス描画テストだけは @napi-rs/canvas が使える環境でのみ実行し、
// 無い環境（CI 等）では skip する。
// ==========================================
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../js/render-core.js");

// 等幅フォント風の measure スタブ（1コードポイント = 10px）
const mono = (s) => Array.from(s).length * 10;

// ----------------------------------------
// 📐 レイアウト定数
// ----------------------------------------
test("レイアウト定数: 幅1200・コンテンツ幅1064・既定カウント", () => {
  assert.equal(Core.IMAGE_WIDTH, 1200);
  assert.equal(Core.CONTENT_X, 68);
  assert.equal(Core.CONTENT_W, 1064);
  assert.deepEqual(Core.DEFAULT_COUNTS, { replies: 2, retweets: 9, likes: 37, views: 1204 });
  assert.equal(Core.MAX_TEXT_LENGTH, 300);
  assert.equal(Core.MAX_BODY_LINES, 12);
});

test("画像の高さ: 1行=488、12行=1170", () => {
  assert.equal(Core.computeImageHeight(1), 488);
  assert.equal(Core.computeImageHeight(12), 1170);
});

// ----------------------------------------
// 🔢 formatCount（X 式の万・億表記）
// ----------------------------------------
test("formatCount: 1万未満はカンマ区切り", () => {
  assert.equal(Core.formatCount(0), "0");
  assert.equal(Core.formatCount(999), "999");
  assert.equal(Core.formatCount(1204), "1,204");
  assert.equal(Core.formatCount(9999), "9,999");
});

test("formatCount: 万の表記（10未満は小数1桁、端数は丸め）", () => {
  assert.equal(Core.formatCount(10000), "1万");
  assert.equal(Core.formatCount(10499), "1万");
  assert.equal(Core.formatCount(10500), "1.1万");
  assert.equal(Core.formatCount(15234), "1.5万");
  assert.equal(Core.formatCount(100000), "10万");
  assert.equal(Core.formatCount(123456), "12万");
});

test("formatCount: 億の表記と境界の癖", () => {
  assert.equal(Core.formatCount(100000000), "1億");
  assert.equal(Core.formatCount(123456789), "1.2億");
  // 1億直前は万表記のまま丸め上がる（旧実装からの既知の癖、そのまま固定）
  assert.equal(Core.formatCount(99999999), "10000万");
});

test("formatCount: 不正値は 0、小数は切り捨て", () => {
  assert.equal(Core.formatCount(-5), "0");
  assert.equal(Core.formatCount(NaN), "0");
  assert.equal(Core.formatCount(Infinity), "0");
  assert.equal(Core.formatCount(123.9), "123");
});

// ----------------------------------------
// 🕐 formatTweetTimestamp
// ----------------------------------------
test("formatTweetTimestamp: 午前・午後・深夜の表記", () => {
  assert.equal(
    Core.formatTweetTimestamp(new Date("2026-11-24T09:05:00+09:00")),
    "午前9:05 · 2026年11月24日"
  );
  assert.equal(
    Core.formatTweetTimestamp(new Date("2026-01-02T15:07:00+09:00")),
    "午後3:07 · 2026年1月2日"
  );
  assert.equal(
    Core.formatTweetTimestamp(new Date("2026-01-02T00:30:00+09:00")),
    "午前0:30 · 2026年1月2日"
  );
});

// ----------------------------------------
// 🔤 コードポイント系ヘルパ
// ----------------------------------------
test("codePointLength: サロゲートペアを1文字として数える", () => {
  assert.equal(Core.codePointLength("𐮷野家"), 3);
  assert.equal(Core.codePointLength("a😀b"), 3);
  assert.equal(Core.codePointLength(""), 0);
});

test("lastCodePoint / dropLastCodePoint", () => {
  assert.equal(Core.lastCodePoint("ab😀"), "😀");
  assert.equal(Core.dropLastCodePoint("ab😀"), "ab");
  assert.equal(Core.dropLastCodePoint(""), "");
});

// ----------------------------------------
// 📝 wrapText（禁則処理）
// ----------------------------------------
test("wrapText: 幅で単純に折り返す", () => {
  assert.deepEqual(Core.wrapText("あいうえお", 30, mono), ["あいう", "えお"]);
});

test("wrapText: 行頭禁則文字は前の行にぶら下がる", () => {
  assert.deepEqual(Core.wrapText("あい、う", 20, mono), ["あい、", "う"]);
});

test("wrapText: 行末禁則文字は次の行へ送られる", () => {
  assert.deepEqual(Core.wrapText("あ（いう", 20, mono), ["あ", "（い", "う"]);
});

test("wrapText: 改行・空行・行頭空白の扱い", () => {
  assert.deepEqual(Core.wrapText("あい\nうえ", 100, mono), ["あい", "うえ"]);
  assert.deepEqual(Core.wrapText("あ\n\nい", 100, mono), ["あ", "", "い"]);
  assert.deepEqual(Core.wrapText("あ\n", 100, mono), ["あ", ""]);
  assert.deepEqual(Core.wrapText(" あい", 100, mono), ["あい"]);
  assert.deepEqual(Core.wrapText("　あい", 100, mono), ["あい"]);
  assert.deepEqual(Core.wrapText("あい\r\nうえ", 100, mono), ["あい", "うえ"]);
});

// ----------------------------------------
// ✂️ truncateToWidth / clampBodyLines
// ----------------------------------------
test("truncateToWidth: 収まる場合はそのまま、超える場合は … で切る", () => {
  assert.equal(Core.truncateToWidth("あい", 30, mono), "あい");
  assert.equal(Core.truncateToWidth("あいうえお", 30, mono), "あい…");
});

test("clampBodyLines: 12行を超えたら最終行を … で締める", () => {
  const lines = Array.from({ length: 13 }, (_, i) => "行" + i);
  const kept = Core.clampBodyLines(lines, 1000, mono);
  assert.equal(kept.length, 12);
  assert.ok(kept[11].endsWith("…"));
  const exact = Array.from({ length: 12 }, (_, i) => "行" + i);
  assert.deepEqual(Core.clampBodyLines(exact, 1000, mono), exact);
});

// ----------------------------------------
// 🧩 入力の正規化
// ----------------------------------------
test("normalizeUsername: 空白と先頭の @ を取り除く", () => {
  assert.equal(Core.normalizeUsername("xx_mabu_xx"), "xx_mabu_xx");
  assert.equal(Core.normalizeUsername("@xx_mabu_xx"), "xx_mabu_xx");
  assert.equal(Core.normalizeUsername("@@foo"), "foo");
  assert.equal(Core.normalizeUsername("  @foo  "), "foo");
  assert.equal(Core.normalizeUsername("@"), "");
  assert.equal(Core.normalizeUsername(""), "");
});

test("parseCountValue: 空欄・不正値・負数は既定値、小数は parseInt 準拠", () => {
  assert.equal(Core.parseCountValue("", 9), 9);
  assert.equal(Core.parseCountValue("   ", 9), 9);
  assert.equal(Core.parseCountValue(null, 9), 9);
  assert.equal(Core.parseCountValue("abc", 9), 9);
  assert.equal(Core.parseCountValue("-3", 9), 9);
  assert.equal(Core.parseCountValue("42", 9), 42);
  assert.equal(Core.parseCountValue("3.9", 9), 3);
  assert.equal(Core.parseCountValue("0", 9), 0);
});

// ----------------------------------------
// 🖼️ 代替アバター
// ----------------------------------------
test("fallbackAvatarSpec: 名前ハッシュで色が決定的に決まる", () => {
  assert.deepEqual(Core.fallbackAvatarSpec("まぶ"), { hue: 160, hue2: 200, initial: "ま" });
  assert.deepEqual(Core.fallbackAvatarSpec(""), { hue: 0, hue2: 40, initial: "?" });
  assert.equal(Core.fallbackAvatarSpec("😀x").initial, "😀");
});

// ----------------------------------------
// 🔍 Discord アイコン URL
// ----------------------------------------
test("discordAvatarUrl: カスタムアバターがある場合", () => {
  const user = { id: "123456789012345678", avatar: "abcdef", discriminator: "0" };
  assert.equal(
    Core.discordAvatarUrl(user, 1024),
    "https://cdn.discordapp.com/avatars/123456789012345678/abcdef.png?size=1024"
  );
});

test("discordAvatarUrl: 既定アイコン（新方式は ID から、旧方式は discriminator から）", () => {
  // 4194304 = 2^22 → (id >> 22) % 6 = 1
  assert.equal(
    Core.discordAvatarUrl({ id: "4194304", avatar: null, discriminator: "0" }, 1024),
    "https://cdn.discordapp.com/embed/avatars/1.png"
  );
  assert.equal(
    Core.discordAvatarUrl({ id: "4194304", avatar: null }, 1024),
    "https://cdn.discordapp.com/embed/avatars/1.png"
  );
  // 1234 % 5 = 4
  assert.equal(
    Core.discordAvatarUrl({ id: "1", avatar: null, discriminator: "1234" }, 1024),
    "https://cdn.discordapp.com/embed/avatars/4.png"
  );
});

// ----------------------------------------
// 🎨 ヘッドレス描画（@napi-rs/canvas がある環境のみ）
// ----------------------------------------
function loadNapiCanvas() {
  const candidates = [
    "@napi-rs/canvas",
    "/home/hatch/workspace/fake-tweet-bot/node_modules/@napi-rs/canvas",
  ];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 次の候補へ */ }
  }
  return null;
}

test("ヘッドレス描画: 幅1200・高さは行数どおり・地と枠線の色", (t) => {
  const napi = loadNapiCanvas();
  if (!napi) { t.skip("@napi-rs/canvas が無い環境"); return; }
  const { createCanvas, GlobalFonts } = napi;
  const fontsDir = path.join(__dirname, "..", "fonts");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansJP-Regular.ttf"), "NotoJP");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansJP-Bold.ttf"), "NotoJPBold");
  const factory = (w, h) => createCanvas(w || 1, h || 1);

  const avatar = Core.fallbackAvatar("まぶ", factory);
  assert.equal(avatar.width, 630);
  assert.equal(avatar.height, 630);

  const text = "新しいWebメーカーを作りました。ブラウザだけでツイート風の画像が作れます";
  const rendered = Core.renderTweetImage({
    text,
    displayName: "まぶ",
    username: "xx_mabu_xx",
    date: new Date("2026-11-24T09:05:00+09:00"),
    counts: { replies: 12, retweets: 48, likes: 326, views: 15234 },
    avatar,
  }, factory);

  assert.equal(rendered.width, 1200);
  // 期待行数は実フォント計測で本文を折り返して求める
  const probe = createCanvas(1, 1).getContext("2d");
  probe.font = Core.BODY_SIZE + 'px "' + Core.FONT_REGULAR + '"';
  const lines = Core.wrapText(text, Core.CONTENT_W, (s) => probe.measureText(s).width);
  assert.equal(rendered.height, Core.computeImageHeight(lines.length));

  const ctx = rendered.getContext("2d");
  const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  // 左上隅は背景の黒
  assert.deepEqual(px(0, 0), [0, 0, 0, 255]);
  // カード左端の枠線は #2f3336 付近（アンチエイリアスを許容）
  const edge = px(Core.CARD_MARGIN, Math.floor(rendered.height / 2));
  assert.ok(Math.abs(edge[0] - 0x2f) <= 8 && Math.abs(edge[1] - 0x33) <= 8 && Math.abs(edge[2] - 0x36) <= 8,
    "border pixel: " + edge.join(","));
  // PNG として書き出せる
  const png = rendered.toBuffer("image/png");
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50); // 'P'
  assert.ok(fs.existsSync(path.join(fontsDir, "NotoSansJP-Regular.ttf")));
});
