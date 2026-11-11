# Wire protocol (observed, static analysis)

Source of truth: the HAR in `~/workspace/browser_downloads/sess-3833836772/`
(138 GETs, no POST/PUT, no WebSocket records) and the extracted bundles.
All of this was traced statically; nothing here was observed at runtime.

## 1. Transport

- Browser → phone: WebUSB (`navigator.usb`), `@yume-chan/adb`.
- ADB sockets are addressed by string, e.g. `shell:<cmd>`, `localabstract:panda-1.1.0`,
  `tcp:43305`, `framebuffer:`.
- PandaKit addresses, in order: `localabstract:panda-1.1.0`, then `tcp:43305`.

## 2. File list: ADB Sync

`adb.sync()` returns an `AdbSync` object.

- `readdir(path)` — list a directory. Entries carry name, mode, size, mtime.
  Type is derived from `mode >> 12`: directory `4`, file `8`, symlink `10`.
  `.` and `..` are filtered out by the UI; directories sort before files.
- `isDirectory(path)` — `lstat(path + "/")` succeeds or throws.
- `read(path)` — readable stream of file bytes (download).
- `write({ filename, file })` — push a file (upload / push the agent jar).

Sync opcodes (4-byte ASCII): `DENT` / `DNT2` (directory entry v1/v2),
`STAT` / `STA2` / `LST2` (stat), `DONE`, `DATA`, `OKAY`, `FAIL`.

Storage volumes are *not* ADB Sync: they come from PandaKit cmd 20 below,
with a UI fallback of `[{ volumeType: 0, label: "内部存储", path: "/sdcard" }]`.

## 3. PandaKit: binary protocol over the ADB socket

All integers are big-endian. A string is `int32 length + UTF-8 bytes`.
A byte block is `int32 length + raw bytes`.

Client sends: `int32 command`, then command-specific arguments.
Server answers in command-specific order (see the table).

| Cmd | Client method | Args | Reply (in order) |
|-----|---------------|------|------------------|
| 10 | `listApps(a, b)` | `int32 a`, `int32 b` (observed call: `3, 64`; `64` plausibly icon size in px, `3` unconfirmed — copy as-is) | `bytes defaultIcon`, `int32 count`, then per app: `string packageName`, `string versionName`, `int64 versionCode`, `string appName`, `int32 installTime`, `int32 updateTime`, `int32 lastUsedTime`, `string installer`, `string cpuArch`, `int32 targetSdk`, `int32 minSdk`, `int32 flags`, `bool hasSplits`, `bool canLaunch`, `int64 appSize`, `int64 dataSize`, `int64 cacheSize`, `bytes icon` (PNG) |
| 13 | `listCameras()` | — | `int32 count`, per camera: `string cameraId`, `int32 lensFacing`, `int32 sensorWidth`, `int32 sensorHeight` |
| 20 | `listStorageVolumes()` | — | `int32 count` (high bit set = error, then `string` message), per volume: `int32 volumeType`, `string label`, `string path` |
| 50/52 | `scanWifi()` | send `50`, wait ~3 s, send `52` | wifi scan results |
| 90 | `wallpaperScreenshot()` | — | PNG bytes, validated by the `137 PNG` header |
| 100 | `shellExec(cmd)` | `string cmd` | `string` output |
| 120 | `screenshot()` | — | `int32 size`, then `size` bytes |
| 200–207, 210, 213, 215–219, 220–224, 230–233, 240–242 | CPU/GPU/FPS/memory/session/battery/network/perf | command-specific | floats / ints / longs, see `src/pandakit.js` |

Icons: each app's `icon` is raw PNG bytes. The client converts them with
`data:image/png;base64,${btoa(...)}`; if an app has no icon bytes it falls
back to `defaultIcon`. Only apps with `canLaunch` are shown, deduplicated
by `packageName`.

## 4. Agent lifecycle (observed)

- Jar path on device: `/data/local/tmp/panda-kit.jar` (pushed via ADB Sync,
  fetched in the browser from `/panda-kit.jar`).
- Start: `CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.panda.Main`
- The agent forks a child and calls `setsid()`, so it is designed to survive
  ADB/USB disconnect as a daemon listening on `panda-1.1.0`.
- Disconnecting from the web page only closes the client socket; it does
  not kill the agent and does not delete the jar.
- Killing the agent happens only on the next (re)connect:
  `pkill -9 -f com.panda.Main`, then the jar is pushed again and the agent
  is restarted. Reboot kills the process; the jar file remains.
