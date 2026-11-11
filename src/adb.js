// Clean-room ADB file operations, built on @yume-chan/adb.
// Protocol notes: see PROTOCOL.md. No Pandatest code is used here.
import { Adb } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";

export async function connectWebUsb() {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new Error("WebUSB 不可用：请用 Chrome/Edge 的 HTTPS 或 localhost 页面打开");
  const device = await manager.requestDevice();
  if (!device) throw new Error("未选择 USB 设备");
  return Adb.authenticate(device);
}

/** List a directory via ADB Sync. Returns entries sorted dirs-first. */
export async function listDirectory(adb, path) {
  const sync = await adb.sync();
  try {
    const entries = await sync.readdir(path);
    return entries
      .filter((e) => e.name !== "." && e.name !== "..")
      .map((e) => ({
        name: e.name,
        // @yume-chan/adb exposes type as "directory" | "file" | "link" on
        // recent versions; fall back to mode bits when present.
        isDirectory: e.type === "directory" || (e.mode != null && (e.mode >> 12) === 4),
        isSymlink: e.type === "link" || (e.mode != null && (e.mode >> 12) === 10),
        size: e.size,
        mtime: e.mtime,
      }))
      .sort((a, b) =>
        a.isDirectory !== b.isDirectory
          ? a.isDirectory ? -1 : 1
          : a.name.localeCompare(b.name));
  } finally {
    await sync.dispose();
  }
}

/** Download a whole file into an ArrayBuffer. */
export async function downloadFile(adb, path) {
  const sync = await adb.sync();
  try {
    const chunks = [];
    for await (const chunk of sync.read(path)) chunks.push(chunk);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out.buffer;
  } finally {
    await sync.dispose();
  }
}

/** Upload bytes to a device path. */
export async function uploadFile(adb, path, data) {
  const sync = await adb.sync();
  try {
    await sync.write({
      filename: path,
      file: data instanceof ReadableStream ? data : new Blob([data]).stream(),
    });
  } finally {
    await sync.dispose();
  }
}

export async function shellText(adb, command) {
  return adb.subprocess.noneProtocol.spawnWaitText(command);
}
