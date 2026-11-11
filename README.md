# scrcpy-jar

浏览器里的 Android 投屏与设备管理，加上一个最小的 PandaKit 兼容 agent。

## 前端：PandaScrcpy（fork）

Web UI 来自 [PandaTestGrid/PandaScrcpy](https://github.com/PandaTestGrid/PandaScrcpy)
（上游提交 `bd0c4b7`，Apache-2.0，见 `LICENSE`），做了两处改动：

- `vite.config.ts` 的 `base` 改为 `VITE_BASE` 环境变量（CI 传入 `/scrcpy-jar/`），
  本地开发默认也是 `/scrcpy-jar/`。
- 新增 `src/components/Scrcpy/pandakit-client.ts`：PandaKit 二进制协议客户端
  （cmd 10 应用列表+图标、cmd 20 存储、cmd 100 shell，协议见 `PROTOCOL.md`），
  并在应用管理页加了一张 “PandaKit 图标模式” 卡片。

上游自带的能力：WebUSB 连接、scrcpy 投屏（WebCodecs / tinyh264 解码）、
触控键鼠、录制截图、应用管理（安装/启动/卸载/导出 APK）、Logcat、Shell、
设备信息/存储/电池、远程观看。

### 为什么换掉之前的极简页面

之前那个极简页面（`Adb.authenticate(device)`）在新版
`@yume-chan/adb` 2.x 里根本不存在这个静态方法——那是 v1 的 API，
2.x 的流程是 `device.connect()` → `AdbDaemonTransport.authenticate({…,
credentialStore})` → `new Adb(transport)`。打包后 `Adb` 被压缩成 `Vs`，
所以页面报错就是 `连接失败：Vs.authenticate is not a function`。
PandaScrcpy 的 `src/components/Scrcpy/adb-client.ts` 用的正是 2.x 的
正确流程，这个报错在新页面里已经不存在了。

## 后端：PandaKit agent（`agent/`，我们自己的最小实现）

`pm list packages` 只能拿到包名（应用管理页默认把包名最后一段当应用名，
也没有图标）。PandaKit cmd 10 一次调用就返回真实应用名 + PNG 图标。

- 构建：`.github/workflows/agent.yml` 用 JDK 17 + Android SDK + `d8`
  编译 `agent/`，产物是 `panda-kit-replica`（run #6：5,205 字节，
  仅 cmd 10/20/100）。
- 用法：在应用管理页的 “PandaKit 图标模式” 卡片里选择下载好的
  `panda-kit-replica.jar`，页面会把它推到 `/data/local/tmp/panda-kit.jar`，
  以 `CLASSPATH=/data/local/tmp/panda-kit.jar app_process /
  com.example.pandakit.Main` 启动（注意类名是 `com.example.pandakit.Main`，
  不是原版的 `com.panda.Main`），再连 `localabstract:panda-1.1.0` 拉
  应用名和图标，合并进应用列表。
- 已知限制：截图 cmd 120 不在此 jar 实现，调用会失败，是预期的；
  大小/时间字段目前返回 0。jar 没有真机验证过守护进程行为。

jar 文件本身不在仓库里（`.gitignore` 排除 `*.jar`），每次从 Actions
产物下载。

## 运行

```bash
npm install   # postinstall 会下载 scrcpy-server 3.3.3
npm run dev   # Chrome/Edge 打开，插手机、开 USB 调试、点连接
npm run build # CI 用 VITE_BASE=/scrcpy-jar/ 构建，部署到 GitHub Pages
```

线上：https://hot-kitty.github.io/scrcpy-jar/

## CI

- `.github/workflows/pages.yml` — `npm ci` + `npm run build`
 （`VITE_BASE=/scrcpy-jar/`）后部署 `dist/` 到 GitHub Pages。
- `.github/workflows/agent.yml` — 编译 Java agent 并上传
  `panda-kit-replica` 产物；打 `v*` tag 时附到 Release。

## License

Apache-2.0（见 `LICENSE`）。Web UI 为 PandaScrcpy 的 fork，
agent 与 PandaKit 客户端为本仓库新增代码，同样按 Apache-2.0 发布。
