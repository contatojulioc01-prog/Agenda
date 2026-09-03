using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AgendaNotifier
{
    internal static class Program
    {
        private const string MutexName = @"Local\\AgendaCorporativaNotifier";

        [STAThread]
        private static void Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            if (!Installation.EnsureInstalled(args)) return;
            bool created;
            using (var mutex = new Mutex(true, MutexName, out created))
            {
                if (!created) return;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new NotifierContext());
            }
        }
    }

    internal static class Installation
    {
        internal static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AgendaNotifier");
        internal static readonly string ExePath = Path.Combine(DirectoryPath, "Agenda.Notifier.exe");
        internal static readonly string ConfigPath = Path.Combine(DirectoryPath, "config.json");
        private const string RunKey = @"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        private const string RunName = "AgendaNotifier";

        internal static bool EnsureInstalled(string[] args)
        {
            var current = Path.GetFullPath(Application.ExecutablePath);
            if (string.Equals(current, ExePath, StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                Directory.CreateDirectory(DirectoryPath);
                File.Copy(current, ExePath, true);
                var info = new ProcessStartInfo(ExePath) { UseShellExecute = true };
                if (args != null && args.Length > 0) info.Arguments = string.Join(" ", args);
                Process.Start(info);
                return false;
            }
            catch (Exception error)
            {
                MessageBox.Show("Não foi possível instalar o Agenda Notifier.\\n\\n" + error.Message, "Agenda Notifier", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        internal static bool StartsWithWindows
        {
            get
            {
                using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
                    return key != null && key.GetValue(RunName) != null;
            }
            set
            {
                using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    if (value) key.SetValue(RunName, ((char)34) + ExePath + ((char)34));
                    else key.DeleteValue(RunName, false);
                }
            }
        }
    }

    internal sealed class AppConfig
    {
        public string serverUrl { get; set; }
        public string protectedToken { get; set; }

        public string GetToken()
        {
            if (string.IsNullOrWhiteSpace(protectedToken)) return "";
            try
            {
                var encrypted = Convert.FromBase64String(protectedToken);
                return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser));
            }
            catch { return ""; }
        }

        public void SetToken(string token)
        {
            var clear = Encoding.UTF8.GetBytes(token ?? "");
            protectedToken = Convert.ToBase64String(ProtectedData.Protect(clear, null, DataProtectionScope.CurrentUser));
        }
    }

    internal static class ConfigStore
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        internal static AppConfig Load()
        {
            try
            {
                if (File.Exists(Installation.ConfigPath))
                    return Json.Deserialize<AppConfig>(File.ReadAllText(Installation.ConfigPath, Encoding.UTF8)) ?? new AppConfig();
            }
            catch { }
            return new AppConfig();
        }
        internal static void Save(AppConfig config)
        {
            Directory.CreateDirectory(Installation.DirectoryPath);
            File.WriteAllText(Installation.ConfigPath, Json.Serialize(config), Encoding.UTF8);
        }
    }

    internal sealed class ActivationPayload { public string serverUrl { get; set; } public string token { get; set; } }
    internal sealed class PendingResponse { public List<PendingNotification> notifications { get; set; } public int pollSeconds { get; set; } }
    internal sealed class PendingNotification
    {
        public string key { get; set; }
        public string type { get; set; }
        public string sourceId { get; set; }
        public string occurrenceDate { get; set; }
        public string scheduledFor { get; set; }
        public string title { get; set; }
        public string body { get; set; }
        public string url { get; set; }
    }
    internal sealed class AckRequest { public List<PendingNotification> notifications { get; set; } }

    internal sealed class NotifierContext : ApplicationContext
    {
        private readonly NotifyIcon tray;
        private readonly ToolStripMenuItem statusItem;
        private readonly ToolStripMenuItem startupItem;
        private readonly System.Windows.Forms.Timer pollTimer;
        private readonly System.Windows.Forms.Timer displayTimer;
        private readonly Queue<PendingNotification> queue = new Queue<PendingNotification>();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private HttpClient client;
        private AppConfig config;
        private PendingNotification visibleNotification;
        private bool polling;

        internal NotifierContext()
        {
            config = ConfigStore.Load();
            if (!string.IsNullOrWhiteSpace(config.GetToken())) Installation.StartsWithWindows = true;
            statusItem = new ToolStripMenuItem("Aguardando configuração") { Enabled = false };
            startupItem = new ToolStripMenuItem("Iniciar com o Windows") { Checked = Installation.StartsWithWindows, CheckOnClick = false, Enabled = false };
            var menu = new ContextMenuStrip();
            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Abrir Agenda", null, delegate { OpenAgenda(); });
            menu.Items.Add("Verificar agora", null, delegate { PollAsync(); });
            menu.Items.Add("Testar notificação", null, delegate { ShowTest(); });
            menu.Items.Add("Configurar", null, delegate { ShowConfiguration(); });
            menu.Items.Add(startupItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Sair", null, delegate { ExitApp(); });
            tray = new NotifyIcon { Icon = SystemIcons.Information, Text = "Agenda - Notificações", Visible = true, ContextMenuStrip = menu };
            tray.DoubleClick += delegate { OpenAgenda(); };
            tray.BalloonTipClicked += delegate { if (visibleNotification != null) OpenUrl(visibleNotification.url); else OpenAgenda(); };
            pollTimer = new System.Windows.Forms.Timer { Interval = 60000 };
            pollTimer.Tick += delegate { PollAsync(); };
            displayTimer = new System.Windows.Forms.Timer { Interval = 4500 };
            displayTimer.Tick += delegate { DisplayNext(); };
            ConfigureClient();
            pollTimer.Start();
            if (string.IsNullOrWhiteSpace(config.GetToken())) ShowConfiguration(); else PollAsync();
        }

        private void ConfigureClient()
        {
            if (client != null) client.Dispose();
            client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var token = config.GetToken();
            if (!string.IsNullOrWhiteSpace(token)) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        private async void PollAsync()
        {
            if (polling || string.IsNullOrWhiteSpace(config.serverUrl) || string.IsNullOrWhiteSpace(config.GetToken())) return;
            polling = true;
            try
            {
                var now = DateTime.Now;
                var url = ApiUrl("/api/notifications/device/pending?date=" + Uri.EscapeDataString(now.ToString("yyyy-MM-dd")) + "&time=" + Uri.EscapeDataString(now.ToString("HH:mm")));
                var response = await client.GetAsync(url);
                if (response.StatusCode == HttpStatusCode.Unauthorized) { statusItem.Text = "Chave revogada — configure novamente"; return; }
                response.EnsureSuccessStatusCode();
                var payload = json.Deserialize<PendingResponse>(await response.Content.ReadAsStringAsync());
                var incoming = payload != null && payload.notifications != null ? payload.notifications : new List<PendingNotification>();
                foreach (var item in incoming) if (!ContainsKey(item.key)) queue.Enqueue(item);
                statusItem.Text = "Conectado · verificado às " + now.ToString("HH:mm");
                if (payload != null && payload.pollSeconds >= 30 && payload.pollSeconds <= 900) pollTimer.Interval = payload.pollSeconds * 1000;
                if (queue.Count > 0 && !displayTimer.Enabled) DisplayNext();
            }
            catch (Exception error) { statusItem.Text = "Sem conexão · " + ShortMessage(error); }
            finally { polling = false; }
        }

        private bool ContainsKey(string key)
        {
            if (visibleNotification != null && visibleNotification.key == key) return true;
            foreach (var item in queue) if (item.key == key) return true;
            return false;
        }

        private async void DisplayNext()
        {
            displayTimer.Stop();
            if (queue.Count == 0) return;
            visibleNotification = queue.Dequeue();
            tray.BalloonTipIcon = visibleNotification.type == "task" ? ToolTipIcon.Warning : ToolTipIcon.Info;
            tray.BalloonTipTitle = visibleNotification.title;
            tray.BalloonTipText = visibleNotification.body;
            tray.ShowBalloonTip(12000);
            await Acknowledge(visibleNotification);
            if (queue.Count > 0) displayTimer.Start();
        }

        private async Task Acknowledge(PendingNotification notification)
        {
            try
            {
                var body = json.Serialize(new AckRequest { notifications = new List<PendingNotification> { notification } });
                var response = await client.PostAsync(ApiUrl("/api/notifications/device/delivered"), new StringContent(body, Encoding.UTF8, "application/json"));
                response.EnsureSuccessStatusCode();
            }
            catch { }
        }

        private void ShowTest()
        {
            visibleNotification = null;
            tray.BalloonTipIcon = ToolTipIcon.Info;
            tray.BalloonTipTitle = "Agenda conectada";
            tray.BalloonTipText = "As notificações do Windows estão funcionando.";
            tray.ShowBalloonTip(10000);
        }

        private void ShowConfiguration()
        {
            using (var form = new ConfigurationForm(config))
            {
                if (form.ShowDialog() != DialogResult.OK) return;
                config = form.Result;
                ConfigStore.Save(config);
                Installation.StartsWithWindows = true;
                startupItem.Checked = true;
                ConfigureClient();
                statusItem.Text = "Configuração salva";
                PollAsync();
            }
        }

        private string ApiUrl(string path) { return (config.serverUrl ?? "").TrimEnd('/') + path; }
        private void OpenAgenda() { if (!string.IsNullOrWhiteSpace(config.serverUrl)) OpenUrl("/"); else ShowConfiguration(); }
        private void OpenUrl(string relative)
        {
            try
            {
                var target = relative != null && relative.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? relative : (config.serverUrl ?? "").TrimEnd('/') + "/" + (relative ?? "").TrimStart('/');
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
            }
            catch { }
        }
        private static string ShortMessage(Exception error) { var message = error.Message ?? "erro de conexão"; return message.Length > 42 ? message.Substring(0, 42) + "…" : message; }
        private void ExitApp() { pollTimer.Stop(); displayTimer.Stop(); tray.Visible = false; tray.Dispose(); client.Dispose(); ExitThread(); }
    }

    internal sealed class ConfigurationForm : Form
    {
        private readonly TextBox codeBox;
        private readonly Label statusLabel;
        private readonly Button activateButton;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly CheckBox startupBox;
        internal AppConfig Result { get; private set; }
        internal bool StartWithWindows { get { return true; } }

        internal ConfigurationForm(AppConfig current)
        {
            Text = "Agenda - Notificações do Windows";
            Icon = SystemIcons.Information;
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(520, 285);
            BackColor = Color.White;
            Font = new Font("Segoe UI", 9F);
            var title = new Label { Text = "Conectar este computador", Font = new Font("Segoe UI Semibold", 15F), AutoSize = true, Location = new Point(24, 22) };
            var help = new Label { Text = "Na Agenda, abra Notificações do Windows, gere o código de ativação e cole abaixo.", AutoSize = false, Size = new Size(470, 42), Location = new Point(26, 58), ForeColor = Color.DimGray };
            var codeLabel = new Label { Text = "Código de ativação", AutoSize = true, Location = new Point(26, 103) };
            codeBox = new TextBox { Multiline = true, ScrollBars = ScrollBars.Vertical, Location = new Point(26, 124), Size = new Size(468, 58) };
            startupBox = new CheckBox { Text = "Iniciará automaticamente com o Windows", AutoSize = true, Location = new Point(26, 196), Checked = true, Enabled = false };
            statusLabel = new Label { Text = "", AutoSize = false, Location = new Point(26, 224), Size = new Size(350, 38), ForeColor = Color.Firebrick };
            activateButton = new Button { Text = "Ativar", Size = new Size(98, 34), Location = new Point(396, 226), BackColor = Color.FromArgb(79, 70, 229), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            activateButton.FlatAppearance.BorderSize = 0;
            activateButton.Click += ActivateAsync;
            Controls.AddRange(new Control[] { title, help, codeLabel, codeBox, startupBox, statusLabel, activateButton });
            if (!string.IsNullOrWhiteSpace(current.GetToken())) { statusLabel.Text = "Este computador já está conectado."; statusLabel.ForeColor = Color.DimGray; }
        }

        private async void ActivateAsync(object sender, EventArgs args)
        {
            activateButton.Enabled = false;
            statusLabel.ForeColor = Color.DimGray;
            statusLabel.Text = "Validando conexão…";
            try
            {
                var raw = Encoding.UTF8.GetString(Convert.FromBase64String(codeBox.Text.Trim()));
                var payload = json.Deserialize<ActivationPayload>(raw);
                if (payload == null || string.IsNullOrWhiteSpace(payload.serverUrl) || string.IsNullOrWhiteSpace(payload.token)) throw new InvalidOperationException("Código incompleto.");
                payload.serverUrl = payload.serverUrl.TrimEnd('/');
                using (var testClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) })
                {
                    testClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", payload.token);
                    var now = DateTime.Now;
                    var response = await testClient.GetAsync(payload.serverUrl + "/api/notifications/device/pending?date=" + Uri.EscapeDataString(now.ToString("yyyy-MM-dd")) + "&time=" + Uri.EscapeDataString(now.ToString("HH:mm")));
                    if (response.StatusCode == HttpStatusCode.Unauthorized) throw new InvalidOperationException("Código inválido ou revogado.");
                    response.EnsureSuccessStatusCode();
                }
                Result = new AppConfig { serverUrl = payload.serverUrl };
                Result.SetToken(payload.token);
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception error)
            {
                statusLabel.ForeColor = Color.Firebrick;
                statusLabel.Text = "Não foi possível ativar: " + error.Message;
                activateButton.Enabled = true;
            }
        }
    }
}
