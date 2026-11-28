# 📜 更新履歴

更新履歴はこのファイルに記録します。見出しは `v版（YYYY-MM-DD）`、分類は 追加 / 変更 / 修正 / 削除 を使います。

## v1.0.0（2026-11-28）

### 追加

- 統一開発フロー（Issue → ブランチ → PR → CI → Rebase and merge）に沿って、リポジトリをゼロから再作成。
- 描画の純ロジックを `js/render-core.js` に分離し、単体テスト（`npm test`、21件）を追加。旧実装との差分検証（約31,700件の比較）と、ヘッドレス描画のピクセル単位の一致確認を実施。
- CI に `workflow_dispatch` と単体テストのステップを追加。

### 変更

- バージョン管理を日付管理から 1.0.0 にリセット（Windows 版の csproj は従来どおり 1.0.0）。
- Service Worker のキャッシュ名を `nisetsui-v3` から `nisetsui-v1` にリセット（旧キャッシュは activate 時に削除される）。
- Windows 版 exe の配布方法を GitHub Release への添付から、各自が `windows/build.bat` / `windows/build.sh` でビルドする形に変更（全リポジトリ共通の「Release はノートのみ」方針に合わせる）。README のダウンロードリンクは削除した。

### 削除

- なし（機能の削除はない。再作成前の全機能を再現している）。

## 2026-11-25（ドキュメント）

- README・CHANGELOG を新ドキュメント設計（2026-11-25）に合わせて再構成（メタ表の追加、節構成と見出し形式の統一）。内容の事実は変更なし。

## 2026-11-24

### 追加

- Windows 版を追加（`windows/`、.NET 8 / WinForms）。Web 版と同じカードレイアウト・アイコン描画・カウント表記（万/億）でツイート風画像を生成し、PNG 保存できる。フォントは Yu Gothic UI で代替し、隠し機能（Discordアイコン取得）は未収録。ビルドは `windows/build.bat` / `windows/build.sh`、成果物は `windows/dist/Nisetsui.exe`（git には含めない）。
- GitHub Release「Windows版 v1.0.0」を公開（タグ `v1.0.0`、exe を添付）。

### 変更

- README・CHANGELOG の書式を統一フォーマットに整理。
