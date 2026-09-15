using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
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

[assembly: System.Reflection.AssemblyVersion("4.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("4.0.0.0")]
[assembly: System.Reflection.AssemblyProduct("Agenda Notifier")]
[assembly: System.Reflection.AssemblyTitle("Agenda - Prazos e Kanban")]

namespace AgendaNotifier
{
    internal static class Program
    {
        private const string MutexName = "AgendaCorporativaNotifier";

        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                if (!Installation.EnsureInstalled(args)) return;
                bool created;
                using (var mutex = new Mutex(true, MutexName, out created))
                {
                    if (!created)
                    {
                        MessageBox.Show("O Agenda Notifier já está executando na bandeja do Windows.", "Agenda Notifier", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return;
                    }
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new NotifierContext(args));
                }
            }
            catch (Exception error)
            {
                CrashLog.Write(error);
                MessageBox.Show("O Agenda Notifier não conseguiu iniciar.\n\nDetalhes: " + error.Message + "\n\nLog: " + CrashLog.Path, "Agenda Notifier", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal static class Installation
    {
        internal static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AgendaNotifier");
        internal static readonly string ExePath = Path.Combine(DirectoryPath, "Agenda.Notifier.v4.exe");
        internal static readonly string ConfigPath = Path.Combine(DirectoryPath, "config.json");
        private static readonly string RunKey = string.Join(((char)92).ToString(), new[] { "Software", "Microsoft", "Windows", "CurrentVersion", "Run" });
        private const string RunName = "AgendaNotifier";

        internal static bool EnsureInstalled(string[] args)
        {
            var current = Path.GetFullPath(Application.ExecutablePath);
            if (string.Equals(current, ExePath, StringComparison.OrdinalIgnoreCase)) return true;
            try
            {
                Directory.CreateDirectory(DirectoryPath);
                // Stop only this user's installed copies, so upgrading releases the old mutex/file.
                foreach (var process in Process.GetProcesses().Where(p => p.ProcessName.StartsWith("Agenda.Notifier", StringComparison.OrdinalIgnoreCase)))
                {
                    using (process)
                    {
                        if (process.Id == Process.GetCurrentProcess().Id) continue;
                        try
                        {
                            var path = process.MainModule.FileName;
                            if (!string.Equals(Path.GetDirectoryName(path), DirectoryPath, StringComparison.OrdinalIgnoreCase)) continue;
                            process.Kill();
                            if (!process.WaitForExit(10000)) throw new IOException("Feche o Agenda Notifier anterior e tente novamente.");
                        }
                        catch (System.ComponentModel.Win32Exception) { }
                    }
                }
                File.Copy(current, ExePath, true);
                var info = new ProcessStartInfo(ExePath) { UseShellExecute = true };
                if (args != null && Array.IndexOf(args, "--startup") >= 0) info.Arguments = "--startup";
                Process.Start(info);
                return false;
            }
            catch (Exception error)
            {
                MessageBox.Show("Não foi possível instalar o Agenda Notifier.\n\n" + error.Message, "Agenda Notifier", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        internal static void RemoveLegacyVersion()
        {
            try
            {
                var legacyFiles = new[] { "Agenda.Notifier.exe", "Agenda.Notifier.v2.exe", "Agenda.Notifier.v3.exe" };
                foreach (var fileName in legacyFiles)
                {
                    var legacy = Path.Combine(DirectoryPath, fileName);
                    if (File.Exists(legacy)) File.Delete(legacy);
                }
            }
            catch { }
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
                    if (value) key.SetValue(RunName, ((char)34) + ExePath + ((char)34) + " --startup");
                    else key.DeleteValue(RunName, false);
                }
            }
        }
    }

    internal static class AppIcon
    {
        private static Icon current;
        internal static Icon Current
        {
            get
            {
                if (current != null) return current;
                try { current = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
                catch { current = SystemIcons.Application; }
                return current;
            }
        }
    }

    internal static class CrashLog
    {
        internal static readonly string Path = System.IO.Path.Combine(Installation.DirectoryPath, "Agenda.Notifier.log");
        internal static void Write(Exception error)
        {
            try
            {
                Directory.CreateDirectory(Installation.DirectoryPath);
                File.AppendAllText(Path, DateTime.Now.ToString("s") + " " + error + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }
    }

    internal sealed class AppConfig
    {
        public string serverUrl { get; set; }
        public string protectedToken { get; set; }
        public bool showKanban { get; set; }
        public string boardId { get; set; }
        public int opacity { get; set; }
        public bool alwaysOnTop { get; set; }
        public int left { get; set; }
        public int top { get; set; }
        public int width { get; set; }
        public int height { get; set; }

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

    internal sealed class ActivationPayload
    {
        public string serverUrl { get; set; }
        public string userId { get; set; }
        public string deviceKey { get; set; }
        public string token { get; set; }
        public string Key { get { return !string.IsNullOrWhiteSpace(deviceKey) ? deviceKey : token; } }
    }
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
        private bool displaying;
        private bool exiting;
        private readonly HashSet<string> shown = new HashSet<string>();
        private readonly Dictionary<string, PendingNotification> pendingAcks = new Dictionary<string, PendingNotification>();
        private KanbanForm kanban;
        private int generation;

        internal NotifierContext(string[] args)
        {
            Installation.RemoveLegacyVersion();
            config = ConfigStore.Load();
            if (!string.IsNullOrWhiteSpace(config.GetToken())) Installation.StartsWithWindows = true;
            statusItem = new ToolStripMenuItem("Aguardando configuração") { Enabled = false };
            startupItem = new ToolStripMenuItem("Iniciar com o Windows") { Checked = Installation.StartsWithWindows, CheckOnClick = false, Enabled = false };
            var menu = new ContextMenuStrip();
            menu.Items.Add(statusItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Abrir Agenda", null, delegate { OpenAgenda(); });
            menu.Items.Add("Kanban na área de trabalho", null, delegate { ToggleKanban(); });
            menu.Items.Add("Verificar agora", null, delegate { PollAsync(); });
            menu.Items.Add("Testar notificação", null, delegate { ShowTest(); });
            menu.Items.Add("Configurar", null, delegate { ShowConfiguration(); });
            menu.Items.Add(startupItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Sair", null, delegate { ExitApp(); });
            tray = new NotifyIcon { Icon = AppIcon.Current, Text = "Agenda - Notificações", Visible = true, ContextMenuStrip = menu };
            tray.DoubleClick += delegate { OpenAgenda(); };
            pollTimer = new System.Windows.Forms.Timer { Interval = 60000 };
            pollTimer.Tick += delegate { PollAsync(); };
            displayTimer = new System.Windows.Forms.Timer { Interval = 4500 };
            displayTimer.Tick += delegate { DisplayNext(); };
            ConfigureClient();
            if (config.showKanban) ShowKanban();
            pollTimer.Start();
            if (string.IsNullOrWhiteSpace(config.GetToken()))
            {
                ShowConfiguration();
            }
            else
            {
                PollAsync();
                if (args == null || Array.IndexOf(args, "--startup") < 0)
                    MessageBox.Show("O Agenda Notifier está funcionando em segundo plano.\n\nVocê pode acessá-lo pelo ícone na bandeja do Windows.", "Agenda Notifier", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void ConfigureClient()
        {
            if (client != null) client.Dispose();
            client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var deviceKey = config.GetToken();
            if (!string.IsNullOrWhiteSpace(deviceKey)) client.DefaultRequestHeaders.Add("X-Device-Key", deviceKey);
        }

        private async void PollAsync()
        {
            if (polling || string.IsNullOrWhiteSpace(config.serverUrl) || string.IsNullOrWhiteSpace(config.GetToken())) return;
            polling = true;
            var currentGeneration = generation;
            try
            {
                var now = DateTime.Now;
                var url = ApiUrl("/api/notifications/device/pending?date=" + Uri.EscapeDataString(now.ToString("yyyy-MM-dd")) + "&time=" + Uri.EscapeDataString(now.ToString("HH:mm")));
                var response = await client.GetAsync(url);
                if (currentGeneration != generation || exiting) return;
                if (response.StatusCode == HttpStatusCode.Unauthorized) {
                    statusItem.Text = "Chave revogada — configure novamente";
                    queue.Clear(); pendingAcks.Clear();
                    if (kanban != null) kanban.SetError("Acesso revogado. Configure novamente.", true);
                    return;
                }
                response.EnsureSuccessStatusCode();
                var payload = json.Deserialize<PendingResponse>(await response.Content.ReadAsStringAsync());
                var incoming = payload != null && payload.notifications != null ? payload.notifications : new List<PendingNotification>();
                if (currentGeneration != generation || exiting) return;
                queue.Clear();
                foreach (var item in incoming) if (!ContainsKey(item.key) && !shown.Contains(item.key)) queue.Enqueue(item);
                foreach (var item in pendingAcks.Values.ToList()) await Acknowledge(item);
                statusItem.Text = "Conectado · verificado às " + now.ToString("HH:mm");
                if (payload != null && payload.pollSeconds >= 30 && payload.pollSeconds <= 900) pollTimer.Interval = payload.pollSeconds * 1000;
                if (queue.Count > 0 && !displayTimer.Enabled) DisplayNext();
                if (kanban != null && kanban.Visible) await RefreshKanban();
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
            if (displaying || exiting || queue.Count == 0) return;
            displaying = true;
            visibleNotification = queue.Dequeue();
            var item = visibleNotification;
            var currentGeneration = generation;
            try
            {
                await NativeToast.Show(item.title, item.body, ResolveUrl(item.url), item.key);
                if (generation != currentGeneration || exiting) return;
                shown.Add(item.key);
                pendingAcks[item.key] = item;
                await Acknowledge(item);
            }
            catch (Exception error) { CrashLog.Write(error); statusItem.Text = "Falha na notificação · " + ShortMessage(error); }
            finally {
                visibleNotification = null;
                displaying = false;
                if (!exiting && queue.Count > 0) displayTimer.Start();
            }
        }

        private async Task Acknowledge(PendingNotification notification)
        {
            try
            {
                var body = json.Serialize(new AckRequest { notifications = new List<PendingNotification> { notification } });
                var response = await client.PostAsync(ApiUrl("/api/notifications/device/delivered"), new StringContent(body, Encoding.UTF8, "application/json"));
                response.EnsureSuccessStatusCode();
                pendingAcks.Remove(notification.key);
            }
            catch { }
        }

        private async void ShowTest()
        {
            try { await NativeToast.Show("Agenda conectada", "Clique para abrir a Agenda no navegador.", ResolveUrl("/"), "test"); }
            catch (Exception error) { CrashLog.Write(error); MessageBox.Show(error.Message, "Não foi possível notificar"); }
        }

        private void ShowConfiguration()
        {
            using (var form = new ConfigurationForm(config))
            {
                if (form.ShowDialog() != DialogResult.OK) return;
                config = form.Result;
                generation++;
                queue.Clear(); shown.Clear(); pendingAcks.Clear();
                if (kanban != null) { kanban.Dispose(); kanban = null; }
                ConfigStore.Save(config);
                Installation.StartsWithWindows = true;
                startupItem.Checked = true;
                ConfigureClient();
                if (config.showKanban) ShowKanban();
                statusItem.Text = "Configuração salva";
                PollAsync();
            }
        }

        private string ApiUrl(string path) { return (config.serverUrl ?? "").TrimEnd('/') + path; }
        private string ResolveUrl(string relative)
        {
            return AgendaLinks.Resolve(config.serverUrl, relative);
        }
        private void OpenAgenda() { if (!string.IsNullOrWhiteSpace(config.serverUrl)) OpenUrl("/"); else ShowConfiguration(); }
        private void OpenUrl(string relative)
        {
            try
            {
                var target = ResolveUrl(relative);
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
            }
            catch { }
        }
        private static string ShortMessage(Exception error) { var message = error.Message ?? "erro de conexão"; return message.Length > 42 ? message.Substring(0, 42) + "…" : message; }
        private void ToggleKanban() {
            if (kanban != null && kanban.Visible) { kanban.Hide(); config.showKanban = false; ConfigStore.Save(config); }
            else ShowKanban();
        }
        private async void ShowKanban() {
            if (string.IsNullOrWhiteSpace(config.GetToken())) { ShowConfiguration(); return; }
            if (kanban == null || kanban.IsDisposed) kanban = new KanbanForm(config, OpenUrl);
            config.showKanban = true; ConfigStore.Save(config);
            kanban.Show();
            await RefreshKanban();
        }
        private async Task RefreshKanban() {
            var form = kanban;
            var currentGeneration = generation;
            try {
                using (var response = await client.GetAsync(ApiUrl("/api/notifications/device/kanban"))) {
                    if (exiting || currentGeneration != generation || form == null || form.IsDisposed) return;
                    if (response.StatusCode == HttpStatusCode.Unauthorized) { form.SetError("Acesso revogado. Configure novamente.", true); return; }
                    response.EnsureSuccessStatusCode();
                    var payload = json.Deserialize<KanbanResponse>(await response.Content.ReadAsStringAsync());
                    if (!exiting && generation == currentGeneration && !form.IsDisposed) form.UpdateBoards(payload.boards ?? new List<DesktopBoard>());
                }
            } catch (Exception error) { if (form != null && !form.IsDisposed) form.SetError("Sem conexão · " + ShortMessage(error), false); }
        }
        private void ExitApp() { exiting = true; pollTimer.Stop(); displayTimer.Stop(); if (kanban != null) kanban.Dispose(); tray.Visible = false; tray.Dispose(); client.Dispose(); ExitThread(); }
    }

    internal sealed class ConfigurationForm : Form
    {
        private readonly TextBox codeBox;
        private readonly Label statusLabel;
        private readonly Button activateButton;
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly CheckBox startupBox;
        private readonly AppConfig previous;
        internal AppConfig Result { get; private set; }
        internal bool StartWithWindows { get { return true; } }

        internal ConfigurationForm(AppConfig current)
        {
            previous = current;
            Text = "Agenda - Notificações do Windows";
            Icon = AppIcon.Current;
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
                var activationCode = new string((codeBox.Text ?? "").Where(character => !char.IsWhiteSpace(character)).ToArray());
                if (activationCode.StartsWith("eyJhbGci", StringComparison.OrdinalIgnoreCase) || activationCode.Split('.').Length == 3)
                    throw new InvalidOperationException("Foi colado o token do portal. Gere o código AGENDA1- na tela Notificações do Windows.");
                if (activationCode.StartsWith("AGENDA1-", StringComparison.OrdinalIgnoreCase))
                    activationCode = activationCode.Substring(8);
                activationCode = activationCode.Replace('-', '+').Replace('_', '/');
                while (activationCode.Length % 4 != 0) activationCode += "=";
                var raw = Encoding.UTF8.GetString(Convert.FromBase64String(activationCode));
                var payload = json.Deserialize<ActivationPayload>(raw);
                if (payload == null || string.IsNullOrWhiteSpace(payload.serverUrl) || string.IsNullOrWhiteSpace(payload.Key)) throw new InvalidOperationException("Código incompleto.");
                payload.serverUrl = payload.serverUrl.TrimEnd('/');
                Uri server;
                if (!Uri.TryCreate(payload.serverUrl, UriKind.Absolute, out server) ||
                    (server.Scheme != "http" && server.Scheme != "https") || !string.IsNullOrEmpty(server.UserInfo) ||
                    !string.IsNullOrEmpty(server.Query) || !string.IsNullOrEmpty(server.Fragment))
                    throw new InvalidOperationException("Endereço da Agenda inválido.");
                using (var testClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) })
                {
                    testClient.DefaultRequestHeaders.Add("X-Device-Key", payload.Key);
                    var now = DateTime.Now;
                    var response = await testClient.GetAsync(payload.serverUrl + "/api/notifications/device/pending?date=" + Uri.EscapeDataString(now.ToString("yyyy-MM-dd")) + "&time=" + Uri.EscapeDataString(now.ToString("HH:mm")));
                    if (response.StatusCode == HttpStatusCode.Unauthorized) throw new InvalidOperationException("Código inválido ou revogado.");
                    response.EnsureSuccessStatusCode();
                }
                Result = new AppConfig { serverUrl = payload.serverUrl, showKanban = previous.showKanban,
                    opacity = previous.opacity, alwaysOnTop = previous.alwaysOnTop, width = previous.width,
                    height = previous.height, left = previous.left, top = previous.top };
                Result.SetToken(payload.Key);
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
