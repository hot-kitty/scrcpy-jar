# scrcpy-jar (clean-room)

A minimal, clean-room re-implementation of the two things Pandatest's Web ADB
page does, built from the observed protocol — not from its code.

- **File list:** browser WebUSB → ADB Sync `readdir()`
- **App list + icons:** a small on-device agent that answers a binary
  protocol over an ADB socket, returning PNG icon bytes

## What is NOT in this repo (on purpose)

The extracted Pandatest bundle (`index--UDYntix.js`, `index-BYine3nj.js`,
…) and the extracted `panda-kit.jar` are **not committed here**. They are
Pandatest's proprietary assets. They stay in the local analysis folder
(`~/workspace/pandatest-rea/`, outside this repo) and are excluded by
`.gitignore`. This repo contains only code written for this replica, plus
documentation of the wire protocol.

If you want to test the web client against the original agent, push your own
locally extracted copy to the device yourself (see `docs` below) — that file
is never part of this git history.

## Layout

```
index.html          minimal UI: connect, file browser, app list
src/adb.js          WebUSB connect + ADB Sync file operations
src/pandakit.js     PandaKit-compatible binary client (cmd 10 / 20 / 100 / 120 …)
src/main.js         UI wiring
agent/              minimal Java agent, written from scratch (cmd 10 / 20 / 100)
PROTOCOL.md         wire protocol, command table, binary format
```

## Run the web client

```bash
npm install
npm run dev
# open the Vite URL in Chrome/Edge, on localhost/HTTPS (WebUSB requires a
# secure context). Plug in an Android device, enable USB debugging, and
# authorise the RSA prompt on the phone.
```

Live demo (GitHub Pages, deployed by Actions on every push to `main`):

https://hot-kitty.github.io/scrcpy-jar/

## CI

- `.github/workflows/pages.yml` — builds the web client (`npm ci` +
  `npm run build` with `VITE_BASE=/scrcpy-jar/`) and deploys `dist/`
  to GitHub Pages. First deploy needs Pages source set to **GitHub Actions**
  (repo Settings → Pages); after that it deploys automatically.
- `.github/workflows/agent.yml` — compiles the Java agent against
  `android.jar` (API 34) and builds a DEX jar with `d8`, uploaded as the
  `panda-kit-replica` artifact. Pushing a `v*` tag attaches the jar to a
  GitHub Release.

Click **Connect**, pick the USB device, then browse `/sdcard`.
**Apps** lists installed apps with icons — but only after the on-device
agent is running (see below).

## Run the on-device agent

Two options:

1. **Use the original agent for interop testing only** (your own local copy,
   not in this repo): push it to `/data/local/tmp/panda-kit.jar` and start it
   with `CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.panda.Main`.
   The client in `src/pandakit.js` speaks the same socket protocol.
2. **Build the minimal agent in `agent/`** (clean-room, cmd 10/20/100 only):
   it needs an Android SDK (API 26+) and `d8`/`dx` to turn the classes into
   a DEX jar. See `agent/README.md`. No JDK is installed on this machine,
   so it is source-only here and has not been compiled here.

## How it works (one paragraph)

The browser talks to the phone over WebUSB with `@yume-chan/adb`.
File listing is plain ADB Sync: `adb.sync().readdir(path)` returns entries
with name / type / size / mtime; downloads use `sync.read()`, uploads use
`sync.write()`. App icons do not come from ADB Sync at all: the web client
opens an ADB socket to `localabstract:panda-1.1.0` (fallback `tcp:43305`),
sends a big-endian int32 command, and the agent on the phone answers with
`PackageManager` data — per app, PNG icon bytes — which the client turns
into `data:image/png;base64,…` URLs. See `PROTOCOL.md` for the exact
command table and binary layout.

## License

MIT, for the code in this repo only.
