using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Security;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AgendaNotifier
{
    internal static class AgendaLinks
    {
        internal static string Resolve(string serverUrl, string relative)
        {
            Uri server;
            if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out server) ||
                (server.Scheme != "http" && server.Scheme != "https")) throw new InvalidOperationException("Configure a conexão com a Agenda primeiro.");
            var value = relative ?? "";
            Uri target;
            if (value.StartsWith("/") && !value.StartsWith("//"))
                target = new Uri(serverUrl.TrimEnd('/') + value);
            else if (!Uri.TryCreate(value, UriKind.Absolute, out target))
                target = new Uri(serverUrl.TrimEnd('/') + "/" + value);
            if (target.Scheme != server.Scheme || target.Authority != server.Authority || !string.IsNullOrEmpty(target.UserInfo) ||
                !(target.AbsolutePath + "/").StartsWith(server.AbsolutePath.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Link fora do servidor da Agenda.");
            return target.AbsoluteUri;
        }
    }

    internal static class NativeToast
    {
        internal const string AppId = "AgendaCorporativa.Notifier";

        // The URL belongs to the toast itself, including in Windows notification history.
        internal static string Xml(string title, string body, string url)
        {
            return "<toast activationType=\"protocol\" launch=\"" + SecurityElement.Escape(url) +
                "\"><visual><binding template=\"ToastGeneric\"><text>" + SecurityElement.Escape(title) +
                "</text><text>" + SecurityElement.Escape(body) + "</text></binding></visual></toast>";
        }

        internal static Task Show(string title, string body, string url, string key)
        {
            var xml64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(Xml(title, body, url)));
            return Task.Run(delegate {
                using (var registration = Registry.CurrentUser.CreateSubKey(@"Software\Classes\AppUserModelId\" + AppId)) {
                    registration.SetValue("DisplayName", "Agenda - Prazos e tarefas");
                    // IconUri expects an image, not an executable resource.
                    var iconPath = System.IO.Path.Combine(Installation.DirectoryPath, "notification.png");
                    System.IO.Directory.CreateDirectory(Installation.DirectoryPath);
                    if (!System.IO.File.Exists(iconPath)) using (var icon = AppIcon.Current.ToBitmap()) icon.Save(iconPath);
                    registration.SetValue("IconUri", iconPath);
                }
                var script = "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; " +
                    "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; " +
                    "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null; " +
                    "$xml=New-Object Windows.Data.Xml.Dom.XmlDocument; " +
                    "$xml.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + xml64 + "'))); " +
                    "$toast=[Windows.UI.Notifications.ToastNotification]::new($xml); " +
                    "$toast.Tag='" + Convert.ToBase64String(System.Security.Cryptography.SHA256.Create().ComputeHash(Encoding.UTF8.GetBytes(key ?? ""))).Substring(0, 16) + "'; " +
                    "$toast.Group='deadlines'; $toast.ExpirationTime=[DateTimeOffset]::Now.AddDays(1); " +
                    "$notifier=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('" + AppId + "'); " +
                    "$notifier.Show($toast);";
                var info = new ProcessStartInfo(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe")) {
                    Arguments = "-NoLogo -NoProfile -NonInteractive -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(script)),
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardError = true
                };
                using (var process = Process.Start(info)) {
                    var error = process.StandardError.ReadToEndAsync();
                    if (!process.WaitForExit(20000)) { process.Kill(); throw new TimeoutException("O Windows não respondeu ao envio da notificação."); }
                    if (process.ExitCode != 0) throw new InvalidOperationException("Falha ao enviar notificação ao Windows: " + error.Result);
                }
            });
        }
    }

    internal sealed class KanbanResponse { public List<DesktopBoard> boards { get; set; } }
    internal sealed class DesktopBoard {
        public string id { get; set; }
        public string name { get; set; }
        public List<DesktopColumn> columns { get; set; }
        public override string ToString() { return name; }
    }
    internal sealed class DesktopColumn {
        public string title { get; set; }
        public string color { get; set; }
        public List<DesktopTask> tasks { get; set; }
    }
    internal sealed class DesktopTask {
        public string title { get; set; }
        public string dueDate { get; set; }
        public string url { get; set; }
    }

    internal sealed class KanbanForm : Form
    {
        private readonly AppConfig config;
        private readonly Action<string> open;
        private readonly ComboBox boards;
        private readonly FlowLayoutPanel columns;
        private readonly Label status;
        private bool updating;
        private string lastPayload;
        protected override bool ShowWithoutActivation { get { return true; } }

        internal KanbanForm(AppConfig settings, Action<string> openUrl)
        {
            config = settings; open = openUrl;
            Text = "Agenda · Kanban na área de trabalho";
            Icon = AppIcon.Current;
            Font = new Font("Segoe UI", 9F);
            BackColor = Color.FromArgb(28, 33, 44); ForeColor = Color.White;
            FormBorderStyle = FormBorderStyle.SizableToolWindow;
            ShowInTaskbar = false;
            MinimumSize = new Size(560, 300);
            Size = new Size(Math.Max(560, config.width > 0 ? config.width : 900), Math.Max(300, config.height > 0 ? config.height : 500));
            StartPosition = FormStartPosition.Manual;
            var working = Screen.PrimaryScreen.WorkingArea;
            Location = config.width > 0 ? new Point(config.left, config.top) : new Point(working.Right - Width - 20, working.Bottom - Height - 20);
            if (!Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(new Rectangle(Location, new Size(100, 40))))) Location = working.Location;
            TopMost = config.alwaysOnTop;
            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 78, Padding = new Padding(8), WrapContents = true };
            boards = new ComboBox { Width = 220, DropDownStyle = ComboBoxStyle.DropDownList };
            boards.SelectedIndexChanged += delegate {
                if (updating) return;
                var board = boards.SelectedItem as DesktopBoard;
                config.boardId = board == null ? null : board.id;
                ConfigStore.Save(config); RenderBoard();
            };
            var opacityLabel = new Label { Text = "Opacidade", AutoSize = true, Margin = new Padding(12, 6, 0, 0) };
            var opacity = new TrackBar { Minimum = 30, Maximum = 100, Value = config.opacity >= 30 && config.opacity <= 100 ? config.opacity : 85, Width = 120, Height = 30, TickFrequency = 10 };
            Opacity = opacity.Value / 100.0;
            opacity.ValueChanged += delegate { Opacity = opacity.Value / 100.0; config.opacity = opacity.Value; ConfigStore.Save(config); };
            var pin = new CheckBox { Text = "Sempre à frente", Checked = TopMost, AutoSize = true, Margin = new Padding(5, 5, 0, 0) };
            pin.CheckedChanged += delegate { TopMost = pin.Checked; config.alwaysOnTop = pin.Checked; ConfigStore.Save(config); };
            toolbar.Controls.AddRange(new Control[] { boards, opacityLabel, opacity, pin });
            status = new Label { Dock = DockStyle.Bottom, Height = 28, Padding = new Padding(8, 4, 0, 0), Text = "Carregando quadros…", ForeColor = Color.LightGray };
            columns = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, WrapContents = false, Padding = new Padding(8) };
            Controls.Add(columns); Controls.Add(toolbar); Controls.Add(status);
            ResizeEnd += delegate { config.left = Left; config.top = Top; config.width = Width; config.height = Height; ConfigStore.Save(config); };
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (args.CloseReason == CloseReason.UserClosing) { args.Cancel = true; Hide(); config.showKanban = false; ConfigStore.Save(config); }
            };
        }

        internal void SetError(string message, bool clear)
        {
            status.Text = message;
            if (clear) { lastPayload = null; boards.Items.Clear(); ClearColumns(); }
        }

        internal void UpdateBoards(List<DesktopBoard> items)
        {
            status.Text = items.Count == 0 ? "Nenhum quadro disponível. Crie um quadro na Agenda." : "Atualizado às " + DateTime.Now.ToString("HH:mm") + " · Clique em um cartão para abrir no navegador";
            var serialized = new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(items);
            if (serialized == lastPayload) return;
            lastPayload = serialized;
            updating = true;
            boards.Items.Clear();
            foreach (var item in items) boards.Items.Add(item);
            var selected = items.FindIndex(item => item.id == config.boardId);
            if (items.Count > 0) boards.SelectedIndex = selected >= 0 ? selected : 0;
            updating = false;
            RenderBoard();
        }

        private void ClearColumns() { while (columns.Controls.Count > 0) columns.Controls[0].Dispose(); }

        private void RenderBoard()
        {
            columns.SuspendLayout();
            ClearColumns();
            var board = boards.SelectedItem as DesktopBoard;
            if (board != null) foreach (var column in board.columns ?? new List<DesktopColumn>()) {
                var list = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, WrapContents = false, AutoSize = true,
                    AutoSizeMode = AutoSizeMode.GrowAndShrink, Width = 235, MinimumSize = new Size(235, 100), Margin = new Padding(0, 0, 12, 0) };
                var tasks = column.tasks ?? new List<DesktopTask>();
                var color = Color.SlateGray;
                try { color = ColorTranslator.FromHtml(column.color); } catch { }
                list.Controls.Add(new Label { Text = column.title + " · " + tasks.Count, Width = 235, Height = 36,
                    BackColor = color, ForeColor = color.GetBrightness() > 0.6 ? Color.Black : Color.White, Padding = new Padding(8) });
                foreach (var task in tasks) {
                    DateTime due;
                    var hasDue = DateTime.TryParseExact(task.dueDate, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out due);
                    var card = new Button { Text = task.title + (hasDue ? "\nPrazo: " + due.ToString("dd/MM/yyyy") : ""),
                        Width = 235, Height = 84, TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(8),
                        BackColor = Color.FromArgb(45, 53, 68), ForeColor = hasDue && due.Date <= DateTime.Today ? Color.FromArgb(255, 203, 120) : Color.White,
                        FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, UseVisualStyleBackColor = false };
                    card.FlatAppearance.BorderSize = 0;
                    var url = task.url;
                    card.Click += delegate { open(url); };
                    list.Controls.Add(card);
                }
                columns.Controls.Add(list);
            }
            columns.ResumeLayout();
        }
    }
}
