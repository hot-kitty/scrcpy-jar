// Clean-room PandaKit-compatible client.
// Wire format (see PROTOCOL.md): big-endian ints, length-prefixed strings
// and byte blocks, over an ADB socket to localabstract:panda-1.1.0.
const ADDRESSES = ["localabstract:panda-1.1.0", "tcp:43305"];

export function bytesToPngDataUrl(bytes) {
  if (!bytes || bytes.length === 0) return null;
  let binary = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

class Reader {
  constructor(readable) { this.reader = readable.getReader(); this.buf = new Uint8Array(0); }
  async readExactly(n) {
    while (this.buf.length < n) {
      const { done, value } = await this.reader.read();
      if (done) throw new Error("PandaKit 连接已关闭");
      const next = new Uint8Array(this.buf.length + value.length);
      next.set(this.buf); next.set(value, this.buf.length); this.buf = next;
    }
    const out = this.buf.slice(0, n); this.buf = this.buf.slice(n); return out;
  }
  async readInt32() { return new DataView((await this.readExactly(4)).buffer).getInt32(0, false); }
  async readInt64() { return new DataView((await this.readExactly(8)).buffer).getBigInt64(0, false); }
  async readBool() { return (await this.readExactly(1))[0] !== 0; }
  async readFloat() { return new DataView((await this.readExactly(4)).buffer).getFloat32(0, false); }
  async readString() {
    const len = await this.readInt32();
    return new TextDecoder().decode(await this.readExactly(len));
  }
  async readBytesBlock() {
    const len = await this.readInt32();
    return await this.readExactly(len);
  }
}

export class PandaKit {
  constructor(adb) { this.adb = adb; this.socket = null; this.reader = null; this.writer = null; this.queue = Promise.resolve(); }

  /** Open the first reachable agent address. */
  async connect() {
    let lastError;
    for (const address of ADDRESSES) {
      try {
        this.socket = await this.adb.createSocket(address);
        this.reader = new Reader(this.socket.readable);
        this.writer = this.socket.writable.getWriter();
        return;
      } catch (e) { lastError = e; }
    }
    throw new Error(`连不上 PandaKit（${ADDRESSES.join(" / ")}）：${lastError?.message ?? lastError}`);
  }

  async dispose() {
    try { await this.writer?.close(); } catch {}
    this.writer = undefined;
    try { await this.socket?.close(); } catch {}
    this.socket = undefined;
  }

  async writeInt(value) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value >>> 0, false);
    await this.writer.write(new Uint8Array(buf));
  }
  async writeString(value) {
    const bytes = new TextEncoder().encode(value);
    await this.writeInt(bytes.length);
    if (bytes.length) await this.writer.write(bytes);
  }
  /** Serialise commands: the agent answers one command at a time. */
  async withLock(fn) {
    let release;
    const next = new Promise((r) => (release = r));
    const prev = this.queue; this.queue = next;
    await prev;
    try { return await fn(); } finally { release(); }
  }

  /** cmd 10. Observed call in the original page: listApps(3, 64). */
  async listApps(a = 3, b = 64) {
    return this.withLock(async () => {
      await this.writeInt(10); await this.writeInt(a); await this.writeInt(b);
      const defaultIcon = await this.reader.readBytesBlock();
      const count = await this.reader.readInt32();
      const apps = [];
      for (let i = 0; i < count; i++) {
        apps.push({
          packageName: await this.reader.readString(),
          versionName: await this.reader.readString(),
          versionCode: await this.reader.readInt64(),
          appName: await this.reader.readString(),
          installTime: await this.reader.readInt32(),
          updateTime: await this.reader.readInt32(),
          lastUsedTime: await this.reader.readInt32(),
          installer: await this.reader.readString(),
          cpuArch: await this.reader.readString(),
          targetSdk: await this.reader.readInt32(),
          minSdk: await this.reader.readInt32(),
          flags: await this.reader.readInt32(),
          hasSplits: await this.reader.readBool(),
          canLaunch: await this.reader.readBool(),
          appSize: await this.reader.readInt64(),
          dataSize: await this.reader.readInt64(),
          cacheSize: await this.reader.readInt64(),
          icon: await this.reader.readBytesBlock(),
        });
      }
      const fallback = bytesToPngDataUrl(defaultIcon);
      return apps
        .filter((app, i, all) => app.canLaunch && all.findIndex((x) => x.packageName === app.packageName) === i)
        .map((app) => ({ ...app, iconDataUrl: bytesToPngDataUrl(app.icon) ?? fallback }));
    });
  }

  /** cmd 20. */
  async listStorageVolumes() {
    return this.withLock(async () => {
      await this.writeInt(20);
      const count = await this.reader.readInt32();
      if (count & 0x80000000) throw new Error(`Storage command failed: ${await this.reader.readString()}`);
      const volumes = [];
      for (let i = 0; i < count; i++) {
        volumes.push({
          volumeType: await this.reader.readInt32(),
          label: await this.reader.readString(),
          path: await this.reader.readString(),
        });
      }
      return volumes;
    });
  }

  /** cmd 100. */
  async shellExec(command) {
    return this.withLock(async () => {
      await this.writeInt(100); await this.writeString(command);
      return this.reader.readString();
    });
  }

  /** cmd 120. */
  async screenshot() {
    return this.withLock(async () => {
      await this.writeInt(120);
      const size = await this.reader.readInt32();
      if (size <= 0) throw new Error("Screenshot failed: invalid size");
      return this.reader.readExactly(size);
    });
  }

  /** cmd 200. */
  async getCpuUsage() {
    return this.withLock(async () => { await this.writeInt(200); return this.reader.readFloat(); });
  }
}

/**
 * Push + start an agent jar on the device (mirrors the observed lifecycle).
 * `jarBytes` is an ArrayBuffer of a jar the user supplies themselves;
 * it is never part of this repo.
 */
export async function pushAndStartAgent(adb, jarBytes, onProgress) {
  const sync = await adb.sync();
  try {
    onProgress?.({ uploaded: jarBytes.byteLength, total: jarBytes.byteLength, percentage: 100 });
    await sync.write({
      filename: "/data/local/tmp/panda-kit.jar",
      file: new Blob([jarBytes]).stream(),
    });
  } finally { await sync.dispose(); }
  await adb.subprocess.noneProtocol.spawnWaitText("pkill -9 -f com.panda.Main 2>/dev/null || true");
  await new Promise((r) => setTimeout(r, 300));
  const proc = await adb.subprocess.noneProtocol.spawn(
    "CLASSPATH=/data/local/tmp/panda-kit.jar app_process / com.panda.Main");
  // Drain a little output so a startup failure is visible, then continue.
  const reader = proc.output?.getReader();
  if (reader) { reader.read().catch(() => {}); }
  await new Promise((r) => setTimeout(r, 500));
  const kit = new PandaKit(adb);
  await kit.connect();
  return kit;
}
