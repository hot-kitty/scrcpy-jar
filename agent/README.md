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

```bash
# 1. Compile against android.jar (API 26+)
javac -cp $ANDROID_HOME/platforms/android-34/android.jar -d out \
  $(find src -name '*.java')
# 2. Turn classes into a DEX jar
d8 --output panda-kit-replica.jar --lib $ANDROID_HOME/platforms/android-34/android.jar out
# 3. Push + start on the device (from the web client, or manually)
adb push panda-kit-replica.jar /data/local/tmp/panda-kit.jar
adb shell CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.example.pandakit.Main
```

The web client in this repo connects to `localabstract:panda-1.1.0`
(the socket name is `panda-1.1.0` in this replica too, for compatibility
with the client). The agent forks/daemonises the same way as the observed
one: the parent process exits after starting the service socket, so the
service survives the ADB shell that launched it.
