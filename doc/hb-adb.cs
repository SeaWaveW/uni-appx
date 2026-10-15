using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// HBuilderX 用管道读 adb。这台电脑上，官方 adb 成功时设备列表和 getprop 进不了管道。
// devices、getprop 自己问 5037 再打印。读不到型号时，设备名会显示 Unknown。
// 其余命令原样转给 SDK 里的 adb.exe。
class HbAdb {
	const string RealAdb = @"C:\Users\seawa\AppData\Local\Android\Sdk\platform-tools\adb.exe";

	static int Main(string[] args) {
		if (args.Length > 0 && args[0] == "devices") {
			return PrintDevices();
		}
		// HBuilderX 先 wait-for-device，5 秒没返回就把这台从列表里丢掉
		// 转给官方 adb 时，offline 会一直挂着，弹窗就是空的
		if (IsWaitForDevice(args)) {
			return WaitForDevice(args[1]);
		}
		if (IsGetProp(args)) {
			return PrintGetProp(args[1]);
		}
		return Forward(args);
	}

	static bool IsWaitForDevice(string[] args) {
		return args.Length >= 3 && args[0] == "-s" && args[2] == "wait-for-device";
	}

	// 自己问 5037。状态已经是 device 就马上返回，别再转给会挂住的 adb
	static int WaitForDevice(string serial) {
		DateTime deadline = DateTime.UtcNow.AddSeconds(4);
		do {
			if (IsOnline(serial)) return 0;
			if (DateTime.UtcNow >= deadline) return 1;
			Thread.Sleep(200);
		} while (true);
	}

	static bool IsOnline(string serial) {
		string body = "";
		try {
			body = Query("host:devices");
		} catch (Exception) {
			return false;
		}
		string[] lines = body.Split(new char[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
		for (int i = 0; i < lines.Length; i++) {
			string[] parts = lines[i].Split('\t');
			if (parts.Length >= 2 && parts[0] == serial && parts[1] == "device") return true;
		}
		return false;
	}

	static bool IsGetProp(string[] args) {
		return args.Length >= 4 && args[0] == "-s" && args[2] == "shell" && args[3] == "getprop";
	}

	static int PrintGetProp(string serial) {
		try {
			Console.Write(Shell(serial, "getprop"));
			return 0;
		} catch (Exception) {
			return Forward(new string[] { "-s", serial, "shell", "getprop" });
		}
	}

	static int PrintDevices() {
		string body = "";
		try {
			body = Query("host:devices");
		} catch (Exception) {
			Forward(new string[] { "start-server" });
			try {
				body = Query("host:devices");
			} catch (Exception) {
				body = "";
			}
		}
		Console.WriteLine("List of devices attached");
		if (!string.IsNullOrEmpty(body)) {
			Console.Write(body);
			if (!body.EndsWith("\n")) Console.WriteLine();
		}
		return 0;
	}

	static string Query(string service) {
		using (TcpClient client = new TcpClient("127.0.0.1", 5037))
		using (NetworkStream stream = client.GetStream()) {
			if (!Send(stream, service)) return "";
			byte[] head = new byte[4];
			ReadExact(stream, head, 4);
			int len = Convert.ToInt32(Encoding.ASCII.GetString(head), 16);
			if (len == 0) return "";
			byte[] data = new byte[len];
			ReadExact(stream, data, len);
			return Encoding.ASCII.GetString(data);
		}
	}

	// shell 在 OKAY 之后没有长度，一直读到连接关掉
	static string Shell(string serial, string command) {
		using (TcpClient client = new TcpClient("127.0.0.1", 5037))
		using (NetworkStream stream = client.GetStream()) {
			if (!Send(stream, "host:transport:" + serial)) return "";
			if (!Send(stream, "shell:" + command)) return "";
			MemoryStream body = new MemoryStream();
			byte[] buf = new byte[8192];
			int n;
			while ((n = stream.Read(buf, 0, buf.Length)) > 0) {
				body.Write(buf, 0, n);
			}
			return Encoding.UTF8.GetString(body.ToArray());
		}
	}

	static bool Send(NetworkStream stream, string service) {
		byte[] msg = Encoding.ASCII.GetBytes(service.Length.ToString("x4") + service);
		stream.Write(msg, 0, msg.Length);
		byte[] head = new byte[4];
		ReadExact(stream, head, 4);
		return Encoding.ASCII.GetString(head) == "OKAY";
	}

	static void ReadExact(NetworkStream stream, byte[] buf, int count) {
		int off = 0;
		while (off < count) {
			int n = stream.Read(buf, off, count - off);
			if (n <= 0) throw new IOException("adb closed");
			off += n;
		}
	}

	static int Forward(string[] args) {
		ProcessStartInfo info = new ProcessStartInfo();
		info.FileName = RealAdb;
		info.Arguments = Join(args);
		info.UseShellExecute = false;
		info.CreateNoWindow = true;
		Process process = Process.Start(info);
		process.WaitForExit();
		return process.ExitCode;
	}

	static string Join(string[] args) {
		StringBuilder builder = new StringBuilder();
		for (int i = 0; i < args.Length; i++) {
			if (i > 0) builder.Append(' ');
			string arg = args[i];
			if (arg.IndexOf(' ') >= 0 || arg.IndexOf('\t') >= 0) {
				builder.Append('"').Append(arg.Replace("\"", "\\\"")).Append('"');
			} else {
				builder.Append(arg);
			}
		}
		return builder.ToString();
	}
}
