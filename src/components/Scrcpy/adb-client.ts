import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { Adb, AdbDaemonTransport, type AdbPacketData } from '@yume-chan/adb';
import { Consumable, ReadableStream, WritableStream } from '@yume-chan/stream-extra';
import {
    PandaKit,
    pushAndStartAgent,
    fetchBundledAgentJar,
    REPLICA_MAIN_CLASS,
} from './pandakit-client';

export interface DeviceMeta {
    serial: string;
    connect: () => Promise<{
        readable: ReadableStream<AdbPacketData>;
        writable: WritableStream<Consumable<AdbPacketData>>;
    }>;
}

export class AdbClient {
    device: Adb | undefined;
    serial: string | undefined;
    name: string | undefined;
    credentialStore: AdbWebCredentialStore;
    /** 连接后自动推送的 PandaKit agent（jar 随前端资源一起发布，同源取回）。 */
    pandakit: PandaKit | null = null;
    pandakitStatus = '未连接';
    pandakitReady: Promise<PandaKit | null> | null = null;

    constructor() {
        this.credentialStore = new AdbWebCredentialStore('high-qa');
    }

    get isSupportedWebUsb() {
        return !!AdbDaemonWebUsbDeviceManager.BROWSER;
    }

    get isConnected() {
        return !!this.device;
    }

    get deviceName() {
        return this.name;
    }

    get deviceSerial() {
        return this.serial;
    }

    async connect(deviceMeta: DeviceMeta) {
        if (this.device) {
            await this.disconnect();
        }
        let readable: ReadableStream<AdbPacketData>;
        let writable: WritableStream<Consumable<AdbPacketData>>;
        try {
            const streams = await deviceMeta.connect();
            readable = streams.readable;
            writable = streams.writable;
        } catch (e: any) {
            if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'NetworkError') {
                throw new Error(
                    'Failed to connect to device. Please check if the device is connected and try again.'
                );
            }
            throw e instanceof Error ? e : new Error(String(e));
        }

        this.device = new Adb(
            await AdbDaemonTransport.authenticate({
                serial: deviceMeta.serial,
                connection: { readable, writable },
                credentialStore: this.credentialStore,
            })
        );
        this.serial = await this.device.getProp('ro.serialno');
        this.name = await this.device.getProp('ro.product.model');

        // 设备连上就自动推 agent：jar 和前端资源一起发布，不用手动选文件。
        // 推送失败也不影响连接本身（投屏、pm 应用列表照常用），只记状态。
        this.pandakitReady = this.tryAutoPushAgent();
        await this.pandakitReady;

        return this.device;
    }

    /** 取回本站内置的 jar 并推到手机启动；失败返回 null，绝不抛错。 */
    private async tryAutoPushAgent(): Promise<PandaKit | null> {
        const adb = this.device;
        if (!adb) return null;
        try {
            await this.pandakit?.dispose().catch(() => {});
            this.pandakit = null;
            this.pandakitStatus = '正在自动推送 PandaKit agent…';
            const jarBytes = await fetchBundledAgentJar();
            this.pandakitStatus = `正在推送 PandaKit agent（jar ${jarBytes.byteLength} 字节）…`;
            this.pandakit = await pushAndStartAgent(adb, jarBytes, REPLICA_MAIN_CLASS);
            this.pandakitStatus = `PandaKit agent 已自动推送并启动（jar ${jarBytes.byteLength} 字节）`;
            return this.pandakit;
        } catch (e) {
            this.pandakit = null;
            this.pandakitStatus = `PandaKit 自动推送失败：${e instanceof Error ? e.message : e}`;
            console.warn(this.pandakitStatus);
            return null;
        }
    }

    /** 自动推送失败后重试（仍是自动取本站内置 jar，不用手动选文件）。 */
    async retryPandaKit(): Promise<PandaKit | null> {
        if (!this.device) return null;
        this.pandakitReady = this.tryAutoPushAgent();
        return await this.pandakitReady;
    }

    async disconnect() {
        await this.pandakit?.dispose().catch(() => {});
        this.pandakit = null;
        this.pandakitStatus = '未连接';
        this.pandakitReady = null;
        if (!this.device) {
            return;
        }
        await this.device.close();
        this.device = undefined;
        this.serial = undefined;
        this.name = undefined;
    }

    /**
     * 结束设备上可能残留的 scrcpy 服务端，避免端口/进程占用导致无法再次投屏。
     * 依赖已建立的 Adb 会话；失败时静默忽略。
     */
    async killScrcpyServerOnDevice(): Promise<void> {
        const adb = this.device;
        if (!adb?.subprocess?.noneProtocol) {
            return;
        }
        try {
            await adb.subprocess.noneProtocol.spawnWaitText(
                "sh -c 'pkill -9 -f com.genymobile.scrcpy 2>/dev/null; pkill -9 -f scrcpy 2>/dev/null; true'",
            );
        } catch {
            // 无 pkill、权限或进程不存在时忽略
        }
    }

    async addUsbDevice() {
        return await AdbDaemonWebUsbDeviceManager.BROWSER!.requestDevice();
    }

    async getUsbDeviceList() {
        return await AdbDaemonWebUsbDeviceManager.BROWSER!.getDevices();
    }
}

const client = new AdbClient();
export default client;
