// PandaKit-compatible client, ported from the clean-room replica's
// src/pandakit.js (see PROTOCOL.md for the wire format).
// The on-device agent answers a binary protocol over an ADB socket to
// localabstract:panda-1.1.0 (fallback tcp:43305): big-endian int32
// commands, length-prefixed strings and byte blocks.
//
// Why this exists when the UI already lists apps via `pm list packages`:
// `pm` gives package names only (AppManager shows the last segment as the
// name, no icons). PandaKit cmd 10 returns real app names + PNG icons in
// one call. Push the agent jar first (Actions artifact `panda-kit-replica`,
// built from agent/ by .github/workflows/agent.yml), then call listApps().
import type { Adb } from '@yume-chan/adb';
import { ReadableStream } from '@yume-chan/stream-extra';

const ADDRESSES = ['localabstract:panda-1.1.0', 'tcp:43305'];

export const REPLICA_MAIN_CLASS = 'com.example.pandakit.Main';
export const ORIGINAL_MAIN_CLASS = 'com.panda.Main';

export function bytesToPngDataUrl(bytes: Uint8Array | null | undefined): string | null {
    if (!bytes || bytes.length === 0) return null;
    let binary = '';
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:image/png;base64,${btoa(binary)}`;
}

class Reader {
    private reader: ReadableStreamDefaultReader<Uint8Array>;
    private buf = new Uint8Array(0);
    constructor(readable: ReadableStream<Uint8Array>) {
        this.reader = readable.getReader();
    }
    async readExactly(n: number): Promise<Uint8Array> {
        while (this.buf.length < n) {
            const { done, value } = await this.reader.read();
            if (done) throw new Error('PandaKit 连接已关闭');
            const next = new Uint8Array(this.buf.length + value.length);
            next.set(this.buf);
            next.set(value, this.buf.length);
            this.buf = next;
        }
        const out = this.buf.slice(0, n);
        this.buf = this.buf.slice(n);
        return out;
    }
    async readInt32(): Promise<number> {
        return new DataView((await this.readExactly(4)).buffer).getInt32(0, false);
    }
    async readInt64(): Promise<bigint> {
        return new DataView((await this.readExactly(8)).buffer).getBigInt64(0, false);
    }
    async readBool(): Promise<boolean> {
        return (await this.readExactly(1))[0] !== 0;
    }
    async readString(): Promise<string> {
        const len = await this.readInt32();
        return new TextDecoder().decode(await this.readExactly(len));
    }
    async readBytesBlock(): Promise<Uint8Array> {
        const len = await this.readInt32();
        return await this.readExactly(len);
    }
}

export interface PandaKitApp {
    packageName: string;
    versionName: string;
    versionCode: bigint;
    appName: string;
    installTime: number;
    updateTime: number;
    lastUsedTime: number;
    installer: string;
    cpuArch: string;
    targetSdk: number;
    minSdk: number;
    flags: number;
    hasSplits: boolean;
    canLaunch: boolean;
    appSize: bigint;
    dataSize: bigint;
    cacheSize: bigint;
    iconDataUrl: string | null;
}

export class PandaKit {
    private adb: Adb;
    private socket: Awaited<ReturnType<Adb['createSocket']>> | null = null;
    private reader: Reader | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private queue: Promise<void> = Promise.resolve();

    constructor(adb: Adb) {
        this.adb = adb;
    }

    async connect(): Promise<void> {
        let lastError: unknown;
        for (const address of ADDRESSES) {
            try {
                this.socket = await this.adb.createSocket(address);
                this.reader = new Reader(this.socket.readable as ReadableStream<Uint8Array>);
                this.writer = (this.socket.writable as WritableStream<Uint8Array>).getWriter();
                return;
            } catch (e) {
                lastError = e;
            }
        }
        throw new Error(
            `连不上 PandaKit（${ADDRESSES.join(' / ')}）：${lastError instanceof Error ? lastError.message : lastError}`
        );
    }

    async dispose(): Promise<void> {
        try {
            await this.writer?.close();
        } catch { /* already closed */ }
        this.writer = null;
        try {
            await this.socket?.close();
        } catch { /* already closed */ }
        this.socket = null;
    }

    private async writeInt(value: number): Promise<void> {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, value >>> 0, false);
        await this.writer!.write(new Uint8Array(buf));
    }

    private async writeString(value: string): Promise<void> {
        const bytes = new TextEncoder().encode(value);
        await this.writeInt(bytes.length);
        if (bytes.length) await this.writer!.write(bytes);
    }

    private async withLock<T>(fn: () => Promise<T>): Promise<T> {
        let release!: () => void;
        const next = new Promise<void>((r) => (release = r));
        const prev = this.queue;
        this.queue = next;
        await prev;
        try {
            return await fn();
        } finally {
            release();
        }
    }

    /** cmd 10. Observed call in the original page: listApps(3, 64). */
    async listApps(a = 3, b = 64): Promise<PandaKitApp[]> {
        return this.withLock(async () => {
            await this.writeInt(10);
            await this.writeInt(a);
            await this.writeInt(b);
            const defaultIcon = await this.reader!.readBytesBlock();
            const count = await this.reader!.readInt32();
            const apps: PandaKitApp[] = [];
            for (let i = 0; i < count; i++) {
                const app: Omit<PandaKitApp, 'iconDataUrl'> & { icon: Uint8Array } = {
                    packageName: await this.reader!.readString(),
                    versionName: await this.reader!.readString(),
                    versionCode: await this.reader!.readInt64(),
                    appName: await this.reader!.readString(),
                    installTime: await this.reader!.readInt32(),
                    updateTime: await this.reader!.readInt32(),
                    lastUsedTime: await this.reader!.readInt32(),
                    installer: await this.reader!.readString(),
                    cpuArch: await this.reader!.readString(),
                    targetSdk: await this.reader!.readInt32(),
                    minSdk: await this.reader!.readInt32(),
                    flags: await this.reader!.readInt32(),
                    hasSplits: await this.reader!.readBool(),
                    canLaunch: await this.reader!.readBool(),
                    appSize: await this.reader!.readInt64(),
                    dataSize: await this.reader!.readInt64(),
                    cacheSize: await this.reader!.readInt64(),
                    icon: await this.reader!.readBytesBlock(),
                };
                apps.push({
                    ...app,
                    iconDataUrl: bytesToPngDataUrl(app.icon) ?? bytesToPngDataUrl(defaultIcon),
                });
            }
            const seen = new Set<string>();
            return apps.filter((app) => {
                if (!app.canLaunch || seen.has(app.packageName)) return false;
                seen.add(app.packageName);
                return true;
            });
        });
    }

    /** cmd 20. */
    async listStorageVolumes(): Promise<{ volumeType: number; label: string; path: string }[]> {
        return this.withLock(async () => {
            await this.writeInt(20);
            const count = await this.reader!.readInt32();
            if (count & 0x80000000) throw new Error(`Storage command failed: ${await this.reader!.readString()}`);
            const volumes = [];
            for (let i = 0; i < count; i++) {
                volumes.push({
                    volumeType: await this.reader!.readInt32(),
                    label: await this.reader!.readString(),
                    path: await this.reader!.readString(),
                });
            }
            return volumes;
        });
    }

    /** cmd 100. */
    async shellExec(command: string): Promise<string> {
        return this.withLock(async () => {
            await this.writeInt(100);
            await this.writeString(command);
            return this.reader!.readString();
        });
    }
}

/**
 * Push an agent jar to the device and start it, then connect a PandaKit
 * client. `jarBytes` comes from a file the user picks in the UI (the
 * `panda-kit-replica` artifact from the Build agent jar workflow, or an
 * original agent jar they hold themselves); the jar is never in this repo.
 */
export async function pushAndStartAgent(
    adb: Adb,
    jarBytes: ArrayBuffer,
    mainClass: string = REPLICA_MAIN_CLASS,
    onProgress?: (p: { uploaded: number; total: number; percentage: number }) => void
): Promise<PandaKit> {
    const sync = await adb.sync();
    try {
        onProgress?.({ uploaded: jarBytes.byteLength, total: jarBytes.byteLength, percentage: 100 });
        await sync.write({
            filename: '/data/local/tmp/panda-kit.jar',
            // @yume-chan/stream-extra 的 ReadableStream（sync.write 要的就是它，
            // 原生 Blob.stream() 类型上缺 values/asyncIterator，vue-tsc 会报错）
            file: new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(jarBytes));
                    controller.close();
                },
            }),
        });
    } finally {
        await sync.dispose();
    }
    await adb.subprocess.noneProtocol.spawnWaitText(`pkill -9 -f ${mainClass} 2>/dev/null || true`);
    await new Promise((r) => setTimeout(r, 300));
    const proc = await adb.subprocess.noneProtocol.spawn(
        `CLASSPATH=/data/local/tmp/panda-kit.jar app_process / ${mainClass}`
    );
    const reader = (proc as unknown as { output?: ReadableStream<Uint8Array> }).output?.getReader();
    if (reader) reader.read().catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    const kit = new PandaKit(adb);
    await kit.connect();
    return kit;
}
