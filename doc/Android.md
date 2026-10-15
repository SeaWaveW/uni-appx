# 在 HBuilderX 里把 uni-app x 跑到安卓模拟器

HBuilderX 负责编译这个项目并装上调试基座。Android Studio 只负责把模拟器开起来。模拟器没开时，运行弹窗是空的，点运行也装不上去。

当前环境：HBuilderX 5.26，Android Studio Rabbit 1（2026.2.1），模拟器 **Medium Phone API 37.0**（x86_64）。这台模拟器在 adb 里的名字是 `emulator-5554`。控制台端口是 `5554`，adb 端口是 `5555`。

## 只做一次

1. 用 HBuilderX 打开文件夹 `D:\Project\uni-appx`。打开这一层，不要打开上一级 `D:\Project`。
2. 打开 **设置 → 运行配置**，按下面填：

   | 项 | 填什么 |
   | --- | --- |
   | 安卓 SDK 路径 | `C:\Users\seawa\AppData\Local\Android\Sdk` |
   | adb 路径 | `D:\Project\uni-appx\doc\hb-adb.exe` |
   | Android 模拟器端口 | 删空。不要填 `26944`，也不要填 `5555` |
   | DevEco Studio | 留空。这是鸿蒙用的 |

   端口这一栏是给夜神、海马玩这类模拟器用的。HBuilderX 会按这里的数字执行 `adb connect 127.0.0.1:端口`。`26944` 是海马玩的端口，本机没有这个程序。Android Studio 自带模拟器会自己登记成 `emulator-5554`，不用连 `5555`。填了 `5555` 会多出一条 `127.0.0.1:5555`，过后容易变成 offline。

   adb 路径不能留空。HBuilderX 用管道读 `adb devices`，这台电脑上官方 adb 成功时设备列表进不了管道，弹窗就会一直是空的。`hb-adb.exe` 自己去问 adb 服务，再把 `emulator-5554` 打印出来。改完这一项后要关掉 HBuilderX 再打开，正在开着的运行弹窗不会读到新路径。

## 每次运行

1. 打开 Android Studio，停在欢迎页即可。不要点 **New Project**，也不用 **Open** 这个 uni-app x 工程。
2. 点欢迎页中间的 **More Actions**，选 **Virtual Device Manager**（设备管理器）。
3. 找到 **Medium Phone API 37.0**，点这一行右侧的播放按钮，等到手机桌面出来。
4. 回到 HBuilderX，选中左侧的 `uni-appx`。
5. 点 **运行 → 运行到手机或模拟器 → 运行到 Android App 基座**。
6. 设备列表是空的就点 **刷新**。出现 `emulator-5554` 后，保持 **使用标准基座运行**，再点 **运行**。

装上的是 DCloud 标准基座，包名 `io.dcloud.uniappx`，图标是绿色 U。之后改页面，会热更新到这个基座里。

## 容易卡住的地方

- 欢迎页上没有 Device Manager。入口在 **More Actions → Virtual Device Manager**。
- 弹窗写「没有检测到设备」，但模拟器已经在桌面：确认 **adb 路径** 是 `D:\Project\uni-appx\doc\hb-adb.exe`，端口是空的。然后完全退出 HBuilderX 再打开，重新点运行，再点 **刷新**。只改设置、不重启，旧弹窗仍会用官方 adb，列表还是空的。
- 一打开就是上个项目，而且返回键点不了：模拟器用快照恢复了上次的画面，系统已经不响应。关掉模拟器窗口。在设备那一行，播放按钮旁边的小三角选 **Cold Boot Now**（冷启动），不要点普通播放。冷启动会进安卓桌面。上个项目的应用还在手机里，不会挡在前面。
- HBuilderX 5.26 的标准基座只有 x86_64。这台模拟器已经是 x86_64。换新模拟器时，系统镜像也要选 x86_64，arm64 镜像装不上这个基座。
- `manifest.json` 里的 `appid` 现在是空的。若运行时提示缺少 AppID，在 HBuilderX 打开 manifest 的可视化界面，登录 DCloud 账号后重新获取。
