/**
 * 分享端 Hook
 * 用于捕获 Scrcpy canvas 视频流并通过 WebRTC 分享给远程观看者
 */

import { ref, shallowRef, computed, onUnmounted } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import Peer from 'peerjs';
import type { MediaConnection, DataConnection } from 'peerjs';
import { PEER_CONFIG, generateShareId } from '@/services/peer-config';
import { deserializeCommand, isTouchCommand, isKeyCommand } from '@/services/command-types';
import { normalizedToDevice } from '@/services/coord-utils';
import scrcpyState from '@/components/Scrcpy/scrcpy-state';

export type ConnectionState = 'idle' | 'initializing' | 'ready' | 'error';

export interface ViewerConnection {
  id: string;
  mediaConnection: MediaConnection;
  dataConnection: DataConnection | null;
  connectedAt: Date;
}

export interface UseScreenShareReturn {
  isSharing: Ref<boolean>;
  peerId: Ref<string | null>;
  viewerCount: Ref<number>;
  connectionState: Ref<ConnectionState>;
  error: Ref<string | null>;
  startSharing: (canvas: HTMLCanvasElement | HTMLVideoElement, frameRate?: number) => Promise<void>;
  stopSharing: () => void;
  viewers: ShallowRef<ViewerConnection[]>;
}

export function useScreenShare(): UseScreenShareReturn {
  const isSharing = ref(false);
  const peerId = ref<string | null>(null);
  const connectionState = ref<ConnectionState>('idle');
  const error = ref<string | null>(null);
  const viewers = shallowRef<ViewerConnection[]>([]);
  
  let peer: Peer | null = null;
  let mediaStream: MediaStream | null = null;
  const mediaConnections: MediaConnection[] = [];
  const dataConnections: DataConnection[] = [];

  const viewerCount = computed(() => viewers.value.length);

  /**
   * 处理来自观看者的控制命令
   */
  function handleCommand(data: unknown): void {
    const command = typeof data === 'string' ? deserializeCommand(data) : data as any;
    if (!command) {
      console.warn('[Host] 收到无效的控制命令:', data);
      return;
    }

    console.log('[Host] 收到控制命令:', command);

    if (isTouchCommand(command)) {
      const deviceCoords = normalizedToDevice(
        command.x,
        command.y,
        scrcpyState.width,
        scrcpyState.height,
        scrcpyState.rotation
      );

      const controller = scrcpyState.scrcpy?.controller;
      if (controller) {
        const actionMap: Record<string, number> = {
          'down': 0,
          'move': 2,
          'up': 1,
        };
        
        controller.injectTouch({
            action: actionMap[command.action] as any,
            pointerId: BigInt(command.pointerId),
            pointerX: deviceCoords.x,
            pointerY: deviceCoords.y,
            pressure: command.action === 'up' ? 0 : 1,
            actionButton: 0,
            buttons: command.action === 'up' ? 0 : 1,
            videoWidth: 0,
            videoHeight: 0
        });
      }
    } else if (isKeyCommand(command)) {
      const keyMap: Record<string, string> = {
        'back': 'Back',
        'home': 'AndroidHome',
        'recents': 'AppSwitch',
      };
      
      const keyName = keyMap[command.key];
      if (keyName && scrcpyState.keyboard) {
        scrcpyState.keyboard.down(keyName);
        setTimeout(() => {
          scrcpyState.keyboard?.up(keyName);
        }, 50);
      }
    }
  }

  /**
   * 开始分享屏幕
   */
  async function startSharing(
    canvas: HTMLCanvasElement | HTMLVideoElement,
    frameRate: number = 30
  ): Promise<void> {
    if (isSharing.value) {
      console.warn('[Host] 已经在分享中');
      return;
    }

    try {
      connectionState.value = 'initializing';
      error.value = null;

      // 捕获视频流（现在统一使用 Canvas 渲染器）
      if (canvas instanceof HTMLCanvasElement) {
        console.log('[Host] 从 Canvas 捕获视频流，尺寸:', canvas.width, 'x', canvas.height);
        mediaStream = canvas.captureStream(frameRate);
      } else {
        throw new Error('不支持的元素类型，请确保使用 Canvas 渲染器');
      }

      if (!mediaStream) {
        throw new Error('无法获取视频流');
      }

      // 清理旧连接
      if (peer && !peer.destroyed) {
        peer.destroy();
      }

      const customId = generateShareId();
      
      await new Promise<void>((resolve, reject) => {
        peer = new Peer(customId, PEER_CONFIG);

        // ========== 信令事件 1: Peer 连接成功 ==========
        peer.on('open', (id) => {
          console.log('[Host] 已连接信令服务器，分享码:', id);
          peerId.value = id;
          isSharing.value = true;
          connectionState.value = 'ready';
          resolve();
        });

        // ========== 信令事件 2: 收到视频请求 ==========
        peer.on('call', (call: MediaConnection) => {
          console.log('[Host] 收到视频请求，来自:', call.peer);
          
          if (!mediaStream) {
            call.close();
            return;
          }

          // 应答并发送视频流
          call.answer(mediaStream);
          mediaConnections.push(call);

          // 添加到观看者列表
          const viewerConnection: ViewerConnection = {
            id: call.peer,
            mediaConnection: call,
            dataConnection: null,
            connectedAt: new Date(),
          };
          viewers.value = [...viewers.value, viewerConnection];

          call.on('close', () => {
            console.log('[Host] 媒体连接关闭:', call.peer);
            const idx = mediaConnections.indexOf(call);
            if (idx > -1) mediaConnections.splice(idx, 1);
            viewers.value = viewers.value.filter(v => v.id !== call.peer);
          });

          call.on('error', (err) => {
            console.error('[Host] 媒体连接错误:', err);
            const idx = mediaConnections.indexOf(call);
            if (idx > -1) mediaConnections.splice(idx, 1);
            viewers.value = viewers.value.filter(v => v.id !== call.peer);
          });
        });

        // ========== 信令事件 3: 收到数据连接（用于远程控制）==========
        peer.on('connection', (dataConn: DataConnection) => {
          console.log('[Host] 收到数据连接，来自:', dataConn.peer);
          dataConnections.push(dataConn);

          // 更新对应观看者的 dataConnection
          const viewer = viewers.value.find(v => v.id === dataConn.peer);
          if (viewer) {
            viewer.dataConnection = dataConn;
          }

          dataConn.on('data', (data) => {
            handleCommand(data);
          });

          dataConn.on('close', () => {
            console.log('[Host] 数据连接关闭:', dataConn.peer);
            const idx = dataConnections.indexOf(dataConn);
            if (idx > -1) dataConnections.splice(idx, 1);
          });

          dataConn.on('error', (err) => {
            console.error('[Host] 数据连接错误:', err);
            const idx = dataConnections.indexOf(dataConn);
            if (idx > -1) dataConnections.splice(idx, 1);
          });
        });

        // ========== 信令事件 4: 连接错误 ==========
        peer.on('error', (err) => {
          console.error('[Host] Peer 错误:', err);
          
          if (err.type === 'unavailable-id') {
            // ID 被占用，尝试随机 ID
            peer?.destroy();
            peer = new Peer(PEER_CONFIG);
            peer.on('open', (id) => {
              peerId.value = id;
              isSharing.value = true;
              connectionState.value = 'ready';
              resolve();
            });
          } else {
            error.value = err.message;
            connectionState.value = 'error';
            reject(err);
          }
        });

        peer.on('disconnected', () => {
          console.warn('[Host] Peer 断开连接，尝试重连...');
          peer?.reconnect();
        });
      });

      console.log('[Host] 开始分享，分享码:', peerId.value);

    } catch (err) {
      console.error('[Host] 启动分享失败:', err);
      error.value = err instanceof Error ? err.message : '未知错误';
      connectionState.value = 'error';
      stopSharing();
      throw err;
    }
  }

  /**
   * 停止分享
   */
  function stopSharing(): void {
    mediaConnections.forEach(c => c.close());
    mediaConnections.length = 0;
    
    dataConnections.forEach(c => c.close());
    dataConnections.length = 0;

    mediaStream?.getTracks().forEach(t => t.stop());
    mediaStream = null;

    peer?.destroy();
    peer = null;

    isSharing.value = false;
    peerId.value = null;
    connectionState.value = 'idle';
    error.value = null;
    viewers.value = [];

    console.log('[Host] 停止分享');
  }

  onUnmounted(() => {
    stopSharing();
  });

  return {
    isSharing,
    peerId,
    viewerCount,
    connectionState,
    error,
    startSharing,
    stopSharing,
    viewers,
  };
}
