using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Windows.Forms;

namespace Nisetsui
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
    }

    internal sealed class MainForm : Form
    {
        // ==========================================
        // 📐 レイアウト定数（Web版 render-core と同一）
        // ==========================================
        private const int ImageWidth = 1200;
        private const int CardMargin = 20;
        private const int CardRadius = 24;
        private const int Pad = 48;
        private const int ContentX = CardMargin + Pad; // 68
        private const int ContentW = ImageWidth - (CardMargin + Pad) * 2; // 1064
        private const int AvatarSize = 96;
        private const int NameSize = 40;
        private const int UserSize = 33;
        private const int BodySize = 44;
        private const int BodyLineHeight = 62;
        private const int MaxBodyLines = 12;
        private const int TimeSize = 32;
        private const int CountSize = 31;
        private const int IconSize = 40;
        private const int MaxTextLength = 300;

        // 🎨 生成画像の配色（X ダークモード風）
        private static readonly Color ImgBg = Color.Black;
        private static readonly Color ImgBorder = Color.FromArgb(47, 51, 54); // #2f3336
        private static readonly Color ImgText = Color.FromArgb(231, 233, 234); // #e7e9ea
        private static readonly Color ImgGray = Color.FromArgb(113, 118, 123); // #71767b

        // 🎨 画面の配色（Web版のダークテーマに合わせる）
        private static readonly Color Bg = Color.FromArgb(10, 15, 28);
        private static readonly Color Surface = Color.FromArgb(17, 26, 46);
        private static readonly Color UiText = Color.FromArgb(236, 241, 248);
        private static readonly Color Muted = Color.FromArgb(157, 177, 199);
        private static readonly Color Accent = Color.FromArgb(106, 141, 255);
        private static readonly Color Border = Color.FromArgb(38, 54, 80);

        // 🔤 Web版は Noto Sans JP 同梱。Windows版は Yu Gothic UI で代替する
        private const string UiFont = "Yu Gothic UI";

        private static readonly CultureInfo Ja = new CultureInfo("ja-JP");

        private readonly TextBox nameBox;
        private readonly TextBox userBox;
        private readonly TextBox tweetBox;
        private readonly DateTimePicker datePicker;
        private readonly TextBox repliesBox;
        private readonly TextBox retweetsBox;
        private readonly TextBox likesBox;
        private readonly TextBox viewsBox;
        private readonly Label avatarFileLabel;
        private readonly Label countLabel;
        private readonly Label statusLabel;
        private readonly PictureBox preview;
        private readonly Button clearAvatarBtn;
        private readonly Button saveBtn;

        private Bitmap? avatarImage;
        private Bitmap? rendered;

        public MainForm()
        {
            Text = "Fake Tweet メーカー for Windows｜ツイート風画像";
            ClientSize = new Size(1160, 700);
            MinimumSize = new Size(900, 580);
            BackColor = Bg;
            ForeColor = UiText;
            Font = new Font(UiFont, 10F);
            AllowDrop = true;
            DragEnter += OnDragEnter;
            DragDrop += OnDragDrop;

            var title = new Label
            {
                Text = "Fake Tweet メーカー｜ツイート風画像",
                Font = new Font(UiFont, 15F, FontStyle.Bold),
                ForeColor = UiText,
                Location = new Point(16, 12),
                AutoSize = true
            };
            Controls.Add(title);

            // ==========================================
            // ⌨️ 左: 入力パネル
            // ==========================================
            var panel = new Panel
            {
                Location = new Point(16, 56),
                Size = new Size(320, 620),
                Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Bottom
            };
            Controls.Add(panel);

            int y = 0;
            panel.Controls.Add(MakeHeading("1. アバター画像", y)); y += 30;
            var pickBtn = MakeButton("画像を選ぶ", 0, y, 150, false);
            pickBtn.Click += (s, e) => PickAvatar();
            panel.Controls.Add(pickBtn);
            clearAvatarBtn = MakeButton("クリア", 162, y, 110, false);
            clearAvatarBtn.Enabled = false;
            clearAvatarBtn.Click += (s, e) => ClearAvatar();
            panel.Controls.Add(clearAvatarBtn); y += 40;
            avatarFileLabel = MakeMuted("未選択（プレースホルダ使用）", 0, y); y += 30;
            panel.Controls.Add(avatarFileLabel);

            panel.Controls.Add(MakeHeading("2. 発言者", y)); y += 30;
            panel.Controls.Add(MakeMuted("表示名", 0, y)); y += 22;
            nameBox = MakeTextBox(0, y, 304); panel.Controls.Add(nameBox); y += 38;
            panel.Controls.Add(MakeMuted("ユーザー名（@は自動で付きます）", 0, y)); y += 22;
            userBox = MakeTextBox(0, y, 304); panel.Controls.Add(userBox); y += 46;

            panel.Controls.Add(MakeHeading("3. 本文とカウント", y)); y += 30;
            tweetBox = new TextBox
            {
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(0, y),
                Size = new Size(304, 84),
                BackColor = Surface,
                ForeColor = UiText,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font(UiFont, 10F)
            };
            tweetBox.TextChanged += (s, e) => UpdateCount();
            panel.Controls.Add(tweetBox); y += 90;
            countLabel = MakeMuted("0 / 300 文字", 0, y); y += 28;
            panel.Controls.Add(countLabel);

            panel.Controls.Add(MakeMuted("投稿日時", 0, y)); y += 22;
            datePicker = new DateTimePicker
            {
                Format = DateTimePickerFormat.Custom,
                CustomFormat = "yyyy/MM/dd HH:mm",
                Location = new Point(0, y),
                Width = 200,
                Value = DateTime.Now
            };
            panel.Controls.Add(datePicker); y += 38;

            // 🔢 カウント4つを2×2に並べる（空欄なら Web版と同じ固定値）
            string[] labels = { "返信", "リポスト", "いいね", "表示数" };
            var boxes = new TextBox[4];
            for (int i = 0; i < 4; i++)
            {
                int cx = (i % 2) * 158;
                int cy = y + (i / 2) * 52;
                panel.Controls.Add(MakeMuted(labels[i], cx, cy));
                boxes[i] = MakeTextBox(cx, cy + 22, 146);
                panel.Controls.Add(boxes[i]);
            }
            repliesBox = boxes[0]; retweetsBox = boxes[1]; likesBox = boxes[2]; viewsBox = boxes[3];
            y += 108;
            var cntNote = MakeMuted("カウントは空欄にすると控えめな固定値になります", 0, y); y += 30;
            panel.Controls.Add(cntNote);

            var sampleBtn = MakeButton("サンプルで試す", 0, y, 140, false);
            sampleBtn.Click += (s, e) => FillSample();
            panel.Controls.Add(sampleBtn);
            var genBtn = MakeButton("画像を生成", 152, y, 152, true);
            genBtn.Click += (s, e) => Generate();
            panel.Controls.Add(genBtn); y += 44;

            saveBtn = MakeButton("PNGを保存", 0, y, 304, false);
            saveBtn.Enabled = false;
            saveBtn.Click += (s, e) => SavePng();
            panel.Controls.Add(saveBtn); y += 44;

            statusLabel = MakeMuted("入力して「画像を生成」を押してください。", 0, y);
            statusLabel.MaximumSize = new Size(304, 0);
            panel.Controls.Add(statusLabel);

            // ==========================================
            // 👁️ 右: プレビュー
            // ==========================================
            var prevLabel = new Label
            {
                Text = "プレビュー（幅1200px・高さは本文の行数で変動）",
                ForeColor = Muted,
                Location = new Point(352, 60),
                AutoSize = true
            };
            Controls.Add(prevLabel);
            preview = new PictureBox
            {
                Location = new Point(352, 86),
                Size = new Size(792, 560),
                Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top | AnchorStyles.Bottom,
                BackColor = Color.Black,
                SizeMode = PictureBoxSizeMode.Zoom,
                BorderStyle = BorderStyle.FixedSingle
            };
            Controls.Add(preview);
        }

        // ==========================================
        // 🧩 コントロール生成ヘルパ
        // ==========================================
        private Label MakeHeading(string text, int y)
        {
            return new Label
            {
                Text = text,
                Font = new Font(UiFont, 11F, FontStyle.Bold),
                ForeColor = UiText,
                Location = new Point(0, y),
                AutoSize = true
            };
        }

        private Label MakeMuted(string text, int x, int y)
        {
            return new Label
            {
                Text = text,
                ForeColor = Muted,
                Location = new Point(x, y),
                AutoSize = true
            };
        }

        private TextBox MakeTextBox(int x, int y, int w)
        {
            return new TextBox
            {
                Location = new Point(x, y),
                Width = w,
                BackColor = Surface,
                ForeColor = UiText,
                BorderStyle = BorderStyle.FixedSingle
            };
        }

        private Button MakeButton(string text, int x, int y, int w, bool primary)
        {
            var b = new Button
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(w, 34),
                BackColor = primary ? Accent : Surface,
                ForeColor = primary ? Color.White : UiText,
                FlatStyle = FlatStyle.Flat
            };
            b.FlatAppearance.BorderColor = Border;
            return b;
        }

        private void SetStatus(string msg) => statusLabel.Text = msg;

        // 🔢 本文の文字数表示を更新する（コードポイント単位）
        private void UpdateCount()
        {
            int len = CountRunes(tweetBox.Text);
            countLabel.Text = len > MaxTextLength
                ? $"{len} / {MaxTextLength} 文字 — 上限を超えています"
                : $"{len} / {MaxTextLength} 文字";
        }

        // ==========================================
        // 🖼️ アバター読み込み
        // ==========================================
        private void OnDragEnter(object? sender, DragEventArgs e)
        {
            if (e.Data != null && e.Data.GetDataPresent(DataFormats.FileDrop)) e.Effect = DragDropEffects.Copy;
        }

        private void OnDragDrop(object? sender, DragEventArgs e)
        {
            if (e.Data?.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            {
                LoadAvatarFile(files[0]);
            }
        }

        private void PickAvatar()
        {
            using var dlg = new OpenFileDialog
            {
                Filter = "画像ファイル|*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.gif|すべてのファイル|*.*",
                Title = "アバター画像を選択"
            };
            if (dlg.ShowDialog(this) == DialogResult.OK) LoadAvatarFile(dlg.FileName);
        }

        private void LoadAvatarFile(string path)
        {
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read);
                using var img = Image.FromStream(fs);
                avatarImage?.Dispose();
                avatarImage = new Bitmap(img);
                avatarFileLabel.Text = Path.GetFileName(path);
                clearAvatarBtn.Enabled = true;
                SetStatus("アバター画像を読み込みました。「画像を生成」を押してください。");
            }
            catch
            {
                SetStatus("画像の読み込みに失敗しました。別のファイルで試してください。");
            }
        }

        private void ClearAvatar()
        {
            avatarImage?.Dispose();
            avatarImage = null;
            avatarFileLabel.Text = "未選択（プレースホルダ使用）";
            clearAvatarBtn.Enabled = false;
        }

        // ==========================================
        // 🎨 生成と保存
        // ==========================================
        // 📝 サンプル内容を入力して生成する（Web版のサンプルと同一）
        private void FillSample()
        {
            nameBox.Text = "まぶ";
            userBox.Text = "xx_mabu_xx";
            tweetBox.Text = "新しいWebメーカーを作りました。ブラウザだけでツイート風の画像が作れます";
            repliesBox.Text = "12";
            retweetsBox.Text = "48";
            likesBox.Text = "326";
            viewsBox.Text = "15234";
            datePicker.Value = DateTime.Now;
            Generate();
        }

        // 🔢 カウント欄を読む（空欄・不正値・負数は既定値）
        private static int ParseCount(TextBox box, int fallback)
        {
            if (string.IsNullOrWhiteSpace(box.Text)) return fallback;
            if (int.TryParse(box.Text.Trim(), out int n) && n >= 0) return n;
            return fallback;
        }

        private void Generate()
        {
            string text = tweetBox.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                SetStatus("本文を入力してください。");
                tweetBox.Focus();
                return;
            }
            if (CountRunes(text) > MaxTextLength)
            {
                SetStatus("本文は300文字以内にしてください。");
                return;
            }
            string displayName = nameBox.Text.Trim();
            if (displayName.Length == 0)
            {
                SetStatus("表示名を入力してください。");
                nameBox.Focus();
                return;
            }
            string username = NormalizeUsername(userBox.Text);
            if (username.Length == 0)
            {
                SetStatus("ユーザー名を入力してください。");
                userBox.Focus();
                return;
            }

            var counts = new TweetCounts
            {
                Replies = ParseCount(repliesBox, 2),
                Retweets = ParseCount(retweetsBox, 9),
                Likes = ParseCount(likesBox, 37),
                Views = ParseCount(viewsBox, 1204)
            };

            Bitmap avatar = avatarImage ?? FallbackAvatar(displayName);
            try
            {
                var bmp = RenderTweetImage(avatar, text, displayName, username, datePicker.Value, counts);
                rendered?.Dispose();
                rendered = bmp;
                preview.Image = bmp;
                saveBtn.Enabled = true;
                SetStatus("生成しました。PNGを保存できます。");
            }
            finally
            {
                if (!ReferenceEquals(avatar, avatarImage)) avatar.Dispose();
            }
        }

        private void SavePng()
        {
            if (rendered == null) return;
            using var dlg = new SaveFileDialog
            {
                Filter = "PNG画像|*.png",
                FileName = "fake-tweet.png",
                Title = "PNGを保存"
            };
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                rendered.Save(dlg.FileName, ImageFormat.Png);
                SetStatus("保存しました: " + dlg.FileName);
            }
        }

        // 🏷️ ユーザー名を正規化する（前後の空白と先頭の @ を取り除く）
        private static string NormalizeUsername(string raw) => raw.Trim().TrimStart('@');

        // 🔤 文字数を数える（サロゲートペア対応）
        private static int CountRunes(string s)
        {
            int n = 0;
            foreach (var _ in s.EnumerateRunes()) n++;
            return n;
        }

        private sealed class TweetCounts
        {
            public int Replies;
            public int Retweets;
            public int Likes;
            public int Views;
        }

        // ==========================================
        // 🔢 フォーマット（Web版 formatCount / formatTweetTimestamp の移植）
        // ==========================================
        // 🔢 数を X 式（万・億）に整形する
        private static string FormatCount(long n)
        {
            if (n < 0) return "0";
            if (n < 10000) return n.ToString("N0", Ja);
            if (n < 100000000)
            {
                double man = n / 10000.0;
                string s = man >= 10
                    ? Math.Round(man).ToString("0", Ja)
                    : (Math.Round(man * 10) / 10).ToString("0.0", CultureInfo.InvariantCulture).Replace(".0", "");
                return s + "万";
            }
            double oku = n / 100000000.0;
            string s2 = oku >= 10
                ? Math.Round(oku).ToString("0", Ja)
                : (Math.Round(oku * 10) / 10).ToString("0.0", CultureInfo.InvariantCulture).Replace(".0", "");
            return s2 + "億";
        }

        // 🕐 日時をツイート表示形式にする（例: 午前9:05 · 2026年11月24日）
        private static string FormatTimestamp(DateTime date)
        {
            // 🕐 Web版は Asia/Tokyo で整形する。Windows版はローカル時刻として扱う
            return date.ToString("tt", Ja) + date.ToString("h:mm", Ja) + " · " +
                   date.ToString("yyyy", Ja) + "年" + date.ToString("M", Ja) + "月" + date.ToString("d", Ja) + "日";
        }

        // ==========================================
        // 🎨 描画本体（Web版 renderTweetImage の移植）
        // ==========================================
        // 🎨 ツイート画像を描いて返す（幅1200、高さは本文行数に応じて可変）
        private Bitmap RenderTweetImage(Bitmap avatarSrc, string text, string displayName, string username, DateTime date, TweetCounts counts)
        {
            using var probe = new Bitmap(1, 1);
            using var pg = Graphics.FromImage(probe);
            using var bodyFont = new Font(UiFont, BodySize);
            var lines = WrapText(text, ContentW, s => Measure(pg, s, bodyFont));
            if (lines.Count > MaxBodyLines)
            {
                lines = lines.GetRange(0, MaxBodyLines);
                string last = lines[MaxBodyLines - 1];
                while (last.Length > 0 && Measure(pg, last + "…", bodyFont) > ContentW) last = DropLastCp(last);
                lines[MaxBodyLines - 1] = last + "…";
            }

            int bodyH = lines.Count * BodyLineHeight;
            int contentH = Pad + AvatarSize + 30 + bodyH + 30 + 44 + 22 + 2 + 20 + 46 + Pad;
            int height = CardMargin * 2 + contentH;

            var bmp = new Bitmap(ImageWidth, height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                g.FillRectangle(Brushes.Black, 0, 0, ImageWidth, height);

                // 🃏 カード地（角丸＋枠線）
                using (var path = RoundedRectPath(CardMargin, CardMargin, ImageWidth - CardMargin * 2, height - CardMargin * 2, CardRadius))
                using (var fill = new SolidBrush(ImgBg))
                using (var pen = new Pen(ImgBorder, 2))
                {
                    g.FillPath(fill, path);
                    g.DrawPath(pen, path);
                }

                int top = CardMargin + Pad;

                // 🖼️ アバター（円形クリップ + cover 切り抜き）
                using (var cover = CoverBitmap(avatarSrc, AvatarSize, AvatarSize))
                {
                    var state = g.Save();
                    using (var clip = new GraphicsPath())
                    {
                        clip.AddEllipse(ContentX, top, AvatarSize, AvatarSize);
                        g.SetClip(clip);
                    }
                    g.DrawImage(cover, ContentX, top);
                    g.Restore(state);
                }

                // 🏷️ 表示名（太字）と @ユーザー名
                int nameX = ContentX + AvatarSize + 24;
                float nameMaxW = ContentX + ContentW - nameX;
                using (var nameFont = new Font(UiFont, NameSize, FontStyle.Bold))
                using (var userFont = new Font(UiFont, UserSize))
                using (var textBrush = new SolidBrush(ImgText))
                using (var grayBrush = new SolidBrush(ImgGray))
                {
                    string name = TruncateToWidth(displayName, nameMaxW, s => Measure(g, s, nameFont));
                    DrawBaseline(g, name, nameFont, textBrush, nameX, top + 44);
                    string uname = TruncateToWidth("@" + username, nameMaxW, s => Measure(g, s, userFont));
                    DrawBaseline(g, uname, userFont, grayBrush, nameX, top + 44 + 46);
                }

                top += AvatarSize + 30;

                // 📝 本文
                using (var textBrush = new SolidBrush(ImgText))
                {
                    for (int i = 0; i < lines.Count; i++)
                    {
                        DrawBaseline(g, lines[i], bodyFont, textBrush, ContentX, top + 46 + i * BodyLineHeight);
                    }
                }
                top += bodyH + 30;

                // 🕐 時刻
                using (var timeFont = new Font(UiFont, TimeSize))
                using (var grayBrush = new SolidBrush(ImgGray))
                {
                    DrawBaseline(g, FormatTimestamp(date), timeFont, grayBrush, ContentX, top + 34);
                }
                top += 44 + 22;

                // ➖ 区切り線
                using (var pen = new Pen(ImgBorder, 2))
                {
                    g.DrawLine(pen, ContentX, top, ContentX + ContentW, top);
                }
                top += 2 + 20;

                // 🔢 カウント行（アイコン＋整形済み数値）
                using (var countFont = new Font(UiFont, CountSize))
                using (var grayBrush = new SolidBrush(ImgGray))
                using (var grayPen = new Pen(ImgGray, 3.5f))
                {
                    grayPen.LineJoin = LineJoin.Round;
                    grayPen.StartCap = LineCap.Round;
                    grayPen.EndCap = LineCap.Round;
                    var items = new (Action<Graphics, Pen, Brush, float, float> Draw, long Value)[]
                    {
                        (DrawReplyIcon, counts.Replies),
                        (DrawRetweetIcon, counts.Retweets),
                        (DrawHeartIcon, counts.Likes),
                        (DrawViewsIcon, counts.Views)
                    };
                    float groupW = (float)ContentW / items.Length;
                    for (int i = 0; i < items.Length; i++)
                    {
                        float gx = ContentX + i * groupW;
                        items[i].Draw(g, grayPen, grayBrush, gx, top + 3);
                        DrawBaseline(g, FormatCount(items[i].Value), countFont, grayBrush, gx + IconSize + 12, top + 34);
                    }
                }
            }
            return bmp;
        }

        // ==========================================
        // 🖌️ アイコン（Web版のパス描画の移植、40×40 基準）
        // ==========================================
        // 💬 返信アイコンを描く
        private static void DrawReplyIcon(Graphics g, Pen pen, Brush brush, float x, float y)
        {
            using var p1 = RoundedRectPath(x + 4, y + 5, 32, 24, 9);
            g.DrawPath(pen, p1);
            using var p2 = new GraphicsPath();
            p2.AddLine(x + 13, y + 29, x + 13, y + 38);
            p2.AddLine(x + 13, y + 38, x + 24, y + 29);
            g.DrawPath(pen, p2);
        }

        // 🔁 リポストアイコンを描く
        private static void DrawRetweetIcon(Graphics g, Pen pen, Brush brush, float x, float y)
        {
            using var p = new GraphicsPath();
            p.AddLine(x + 7, y + 11, x + 31, y + 11);
            p.StartFigure();
            p.AddLine(x + 24, y + 4, x + 32, y + 11);
            p.AddLine(x + 32, y + 11, x + 24, y + 18);
            p.StartFigure();
            p.AddLine(x + 31, y + 11, x + 31, y + 21);
            p.StartFigure();
            p.AddLine(x + 33, y + 29, x + 9, y + 29);
            p.StartFigure();
            p.AddLine(x + 16, y + 22, x + 8, y + 29);
            p.AddLine(x + 8, y + 29, x + 16, y + 36);
            p.StartFigure();
            p.AddLine(x + 9, y + 29, x + 9, y + 19);
            g.DrawPath(pen, p);
        }

        // ❤️ いいねアイコンを描く
        private static void DrawHeartIcon(Graphics g, Pen pen, Brush brush, float x, float y)
        {
            using var p = new GraphicsPath();
            p.StartFigure();
            p.AddBezier(x + 20, y + 34, x + 20, y + 30, x + 2, y + 19, x + 2, y + 11);
            p.AddBezier(x + 2, y + 11, x + 2, y + 3, x + 9, y + 1, x + 13, y + 4);
            p.AddBezier(x + 13, y + 4, x + 17, y + 6, x + 20, y + 10, x + 20, y + 13);
            p.AddBezier(x + 20, y + 13, x + 20, y + 10, x + 23, y + 6, x + 27, y + 4);
            p.AddBezier(x + 27, y + 4, x + 31, y + 1, x + 38, y + 3, x + 38, y + 11);
            p.AddBezier(x + 38, y + 11, x + 38, y + 19, x + 20, y + 30, x + 20, y + 34);
            g.DrawPath(pen, p);
        }

        // 📊 表示数アイコンを描く
        private static void DrawViewsIcon(Graphics g, Pen pen, Brush brush, float x, float y)
        {
            float baseY = y + 36;
            var bars = new (float X, float H)[] { (6, 12), (15, 21), (24, 9), (33, 27) };
            foreach (var (bx, bh) in bars)
            {
                g.FillRectangle(brush, x + bx, baseY - bh, 5, bh);
            }
        }

        // 🖌️ 角丸矩形のパスを作る
        private static GraphicsPath RoundedRectPath(float x, float y, float w, float h, float r)
        {
            var path = new GraphicsPath();
            float d = r * 2;
            path.AddArc(x, y, d, d, 180, 90);
            path.AddArc(x + w - d, y, d, d, 270, 90);
            path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
            path.AddArc(x, y + h - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        // ==========================================
        // 📏 テキスト計測・描画ヘルパ
        // ==========================================
        private static float Measure(Graphics g, string s, Font font)
        {
            if (s.Length == 0) return 0;
            return g.MeasureString(s, font, int.MaxValue, StringFormat.GenericTypographic).Width;
        }

        // 📏 フォントのアセント比（ベースライン位置の換算用）
        private static float AscentRatio(Font font)
        {
            var fam = font.FontFamily;
            return (float)fam.GetCellAscent(font.Style) / fam.GetEmHeight(font.Style);
        }

        // 📏 Canvas の fillText と同じくベースライン基準で描く
        private static void DrawBaseline(Graphics g, string s, Font font, Brush brush, float x, float baselineY)
        {
            float y = baselineY - AscentRatio(font) * font.Size;
            g.DrawString(s, font, brush, x, y, StringFormat.GenericTypographic);
        }

        // ✂️ 幅に収まるよう末尾を「…」で切る
        private static string TruncateToWidth(string text, float maxWidth, Func<string, float> measure)
        {
            if (measure(text) <= maxWidth) return text;
            string s = text;
            while (s.Length > 0 && measure(s + "…") > maxWidth) s = DropLastCp(s);
            return s + "…";
        }

        // ==========================================
        // 📝 折り返し（Web版 wrapText の移植、禁則処理つき）
        // ==========================================
        private const string NoLineStart = "、。，．！？：；）」』】〉》ー〜…‥・ゝゞ々ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ";
        private const string NoLineEnd = "（「『【〈《";

        private static List<string> CodePoints(string s)
        {
            var list = new List<string>();
            foreach (var r in s.EnumerateRunes()) list.Add(r.ToString());
            return list;
        }

        private static string LastCp(string s)
        {
            string last = "";
            foreach (var r in s.EnumerateRunes()) last = r.ToString();
            return last;
        }

        private static string DropLastCp(string s)
        {
            var cps = CodePoints(s);
            if (cps.Count == 0) return s;
            cps.RemoveAt(cps.Count - 1);
            return string.Concat(cps);
        }

        private static List<string> WrapText(string text, float maxWidth, Func<string, float> measure)
        {
            var lines = new List<string>();
            foreach (var paragraph in text.Replace("\r\n", "\n").Split('\n'))
            {
                if (paragraph.Length == 0)
                {
                    lines.Add("");
                    continue;
                }
                string line = "";
                foreach (var ch in CodePoints(paragraph))
                {
                    if (line.Length == 0)
                    {
                        if (ch == " " || ch == "　") continue;
                        line = ch;
                        continue;
                    }
                    if (measure(line + ch) <= maxWidth)
                    {
                        line += ch;
                        continue;
                    }
                    if (NoLineStart.Contains(ch))
                    {
                        line += ch;
                        continue;
                    }
                    string last = LastCp(line);
                    if (NoLineEnd.Contains(last) && CodePoints(line).Count >= 2)
                    {
                        lines.Add(DropLastCp(line));
                        line = last + ch;
                        continue;
                    }
                    lines.Add(line);
                    line = (ch == " " || ch == "　") ? "" : ch;
                }
                if (line.Length != 0 || lines.Count == 0) lines.Add(line);
            }
            return lines;
        }

        // ==========================================
        // 🖼️ アバター加工
        // ==========================================
        // 🖼️ アバターを正方形に切り抜く（cover）
        private static Bitmap CoverBitmap(Bitmap src, int w, int h)
        {
            var dst = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                float scale = Math.Max((float)w / src.Width, (float)h / src.Height);
                float dw = src.Width * scale;
                float dh = src.Height * scale;
                g.DrawImage(src, (w - dw) / 2f, (h - dh) / 2f, dw, dh);
            }
            return dst;
        }

        // 🎨 HSL を RGB に変換する（代替アバターのグラデーション用）
        private static Color HslToRgb(double h, double s, double l)
        {
            h = ((h % 360) + 360) % 360 / 360.0;
            double c = (1 - Math.Abs(2 * l - 1)) * s;
            double x = c * (1 - Math.Abs(h * 6 % 2 - 1));
            double m = l - c / 2;
            double r, g, b;
            if (h < 1.0 / 6) { r = c; g = x; b = 0; }
            else if (h < 2.0 / 6) { r = x; g = c; b = 0; }
            else if (h < 3.0 / 6) { r = 0; g = c; b = x; }
            else if (h < 4.0 / 6) { r = 0; g = x; b = c; }
            else if (h < 5.0 / 6) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            return Color.FromArgb(
                (int)Math.Round((r + m) * 255),
                (int)Math.Round((g + m) * 255),
                (int)Math.Round((b + m) * 255));
        }

        // 🖼️ 名前のハッシュ色グラデーション + 頭文字（Web版 fallbackAvatar の移植）
        private static Bitmap FallbackAvatar(string displayName)
        {
            const int size = 630;
            var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
                int hash = 0;
                foreach (var r in displayName.EnumerateRunes()) hash = (hash * 31 + r.Value) % 360;
                var c1 = HslToRgb(hash, 0.32, 0.30);
                var c2 = HslToRgb((hash + 40) % 360, 0.36, 0.16);
                using (var grad = new LinearGradientBrush(new Point(0, 0), new Point(size, size), c1, c2))
                {
                    g.FillRectangle(grad, 0, 0, size, size);
                }
                string initial = "?";
                foreach (var r in displayName.EnumerateRunes()) { initial = r.ToString(); break; }
                using var font = new Font(UiFont, 300);
                using var brush = new SolidBrush(Color.FromArgb(235, 245, 243, 236));
                float w = Measure(g, initial, font);
                float y = size / 2f + 108 - AscentRatio(font) * font.Size;
                g.DrawString(initial, font, brush, (size - w) / 2f, y, StringFormat.GenericTypographic);
            }
            return bmp;
        }
    }
}
