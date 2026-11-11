# Minimal PandaKit-compatible agent (clean-room)

Java source written from scratch from the observed wire protocol
(`PROTOCOL.md`). It implements only:

- cmd 10 `listApps` — `PackageManager.getInstalledPackages`, per-app PNG
  icon bytes (`drawableToBitmap` → `Bitmap.compress(PNG)`), plus a
  default icon
- cmd 20 `listStorageVolumes` — `StorageManager.getStorageVolumes`
- cmd 100 `shellExec` — runs a shell command and returns stdout

It does **not** contain any decompiled Pandatest code.

## Build (needs Android SDK, not installed on this machine)

GitHub Actions already builds this on every push to `main` (see
`.github/workflows/agent.yml`): JDK 17 + the runner's preinstalled Android
SDK, API 34. Download the `panda-kit-replica` artifact from the latest
successful run instead of building locally when you can.

To build locally:

```bash
# 1. Compile against android.jar (API 26+)
javac -cp $ANDROID_HOME/platforms/android-34/android.jar -d out \
  $(find src -name '*.java')
# 2. Pack the classes into a jar first — d8 does NOT accept the raw
#    class-output directory ("Unsupported source file type" if passed directly)
jar --create --file agent-classes.jar -C out .
d8 --output panda-kit-replica.jar --lib $ANDROID_HOME/platforms/android-34/android.jar agent-classes.jar
# 3. Push + start on the device (from the web client, or manually)
adb push panda-kit-replica.jar /data/local/tmp/panda-kit.jar
adb shell CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.example.pandakit.Main
```

The web client in this repo connects to `localabstract:panda-1.1.0`
(the socket name is `panda-1.1.0` in this replica too, for compatibility
with the client). The agent forks/daemonises the same way as the observed
one: the parent process exits after starting the service socket, so the
service survives the ADB shell that launched it.
