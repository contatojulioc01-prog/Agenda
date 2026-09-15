using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Xml;

namespace AgendaNotifier
{
    internal static class SmokeTests
    {
        [STAThread]
        private static void Main(string[] args)
        {
            var url = "https://example.com/agenda/tarefas/board?tarefa=a&ramificacao=b";
            if (AgendaLinks.Resolve("https://example.com/agenda", "/tarefas/board?tarefa=a&ramificacao=b") != url) throw new Exception("Subpath was lost");
            if (AgendaLinks.Resolve("https://example.com", "/tarefas") != "https://example.com/tarefas") throw new Exception("Root route was lost");
            foreach (var invalid in new[] { "file:///C:/test.exe", "https://other.example/agenda", "https://example.com/outside", "/../outside" }) {
                var rejected = false;
                try { AgendaLinks.Resolve("https://example.com/agenda", invalid); } catch (InvalidOperationException) { rejected = true; }
                if (!rejected) throw new Exception("Unsafe destination accepted: " + invalid);
            }
            var xml = new XmlDocument();
            xml.LoadXml(NativeToast.Xml("Prazo <hoje>", "Revisão & ação", url));
            if (xml.DocumentElement.GetAttribute("launch") != url) throw new Exception("Toast lost its destination");
            if (xml.DocumentElement.GetAttribute("activationType") != "protocol") throw new Exception("Toast cannot open the browser");
            Application.EnableVisualStyles();
            using (var form = new KanbanForm(new AppConfig { opacity = 80 }, delegate { })) {
                form.UpdateBoards(new List<DesktopBoard> { new DesktopBoard { id = "one", name = "Equipe · Projeto", columns = new List<DesktopColumn> {
                    new DesktopColumn { title = "A fazer", color = "#64748b", tasks = new List<DesktopTask> { new DesktopTask { title = "Revisar o planejamento da próxima entrega", dueDate = DateTime.Today.ToString("yyyy-MM-dd"), url = url } } },
                    new DesktopColumn { title = "Em andamento", color = "#f59e0b", tasks = new List<DesktopTask> { new DesktopTask { title = "Preparar material da reunião", dueDate = DateTime.Today.AddDays(1).ToString("yyyy-MM-dd"), url = url } } },
                    new DesktopColumn { title = "Concluído", color = "#10b981", tasks = new List<DesktopTask>() }
                } } });
                form.Show();
                Application.DoEvents();
                using (var bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, new Rectangle(0, 0, form.Width, form.Height)); bitmap.Save(args[0]); }
                form.Hide();
                if (form.Opacity != 0.8) throw new Exception("Opacity was not restored");
                form.SetError("Acesso revogado", true);
                form.UpdateBoards(new List<DesktopBoard>());
            }
            if (Array.IndexOf(args, "--toast") >= 0)
                NativeToast.Show("Agenda · teste de instalação", "Validação das notificações de prazos. Este aviso é um teste.", "https://example.com/agenda/", "smoke-test").GetAwaiter().GetResult();
            Console.WriteLine("Notifier smoke tests passed");
        }
    }
}
