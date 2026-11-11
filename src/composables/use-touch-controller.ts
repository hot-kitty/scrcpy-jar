/**
 * 触摸控制 Hook
 * 用于处理观看端的触摸和按键事件，转换为控制命令发送给分享端
 */

import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { clientToNormalized } from '@/services/coord-utils';
import type { RemoteControlCommand, TouchCommand, KeyCommand } from '@/services/command-types';

export interface UseTouchControllerReturn {
  // 绑定到视频元素的事件处理器
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  
  // 按键处理
  sendBackKey: () => void;
  sendHomeKey: () => void;
  sendRecentsKey: () => void;
  
  // 活跃的触摸点
  activePointers: Ref<Map<number, { x: number; y: number }>>;
}

export function useTouchController(
  sendCommand: (cmd: RemoteControlCommand) => void,
  videoElement: Ref<HTMLVideoElement | HTMLElement | null>
): UseTouchControllerReturn {
  // 追踪活跃的触摸点
  const activePointers = ref<Map<number, { x: number; y: number }>>(new Map());

  /**
   * 创建触摸命令
   */
  function createTouchCommand(
    action: 'down' | 'move' | 'up',
    x: number,
    y: number,
    pointerId: number
  ): TouchCommand {
    return {
      type: 'touch',
      action,
      x,
      y,
      pointerId,
    };
  }

  /**
   * 创建按键命令
   */
  function createKeyCommand(key: 'back' | 'home' | 'recents'): KeyCommand {
    return {
      type: 'key',
      key,
    };
  }

  /**
   * 处理 pointer down 事件
   */
  function onPointerDown(e: PointerEvent): void {
    if (!videoElement.value) return;

    // 阻止默认行为（如文本选择）
    e.preventDefault();

    // 捕获 pointer 以接收后续事件
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // 计算归一化坐标
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // 记录活跃的触摸点
    activePointers.value.set(e.pointerId, { x, y });

    // 发送触摸命令
    const command = createTouchCommand('down', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * 处理 pointer move 事件
   */
  function onPointerMove(e: PointerEvent): void {
    if (!videoElement.value) return;

    // 只处理已经按下的触摸点
    if (!activePointers.value.has(e.pointerId)) return;

    e.preventDefault();

    // 计算归一化坐标
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // 更新触摸点位置
    activePointers.value.set(e.pointerId, { x, y });

    // 发送触摸命令
    const command = createTouchCommand('move', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * 处理 pointer up 事件
   */
  function onPointerUp(e: PointerEvent): void {
    if (!videoElement.value) return;

    // 只处理已经按下的触摸点
    if (!activePointers.value.has(e.pointerId)) return;

    e.preventDefault();

    // 释放 pointer 捕获
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // 计算归一化坐标
    const { x, y } = clientToNormalized(e.clientX, e.clientY, videoElement.value);

    // 移除活跃的触摸点
    activePointers.value.delete(e.pointerId);

    // 发送触摸命令
    const command = createTouchCommand('up', x, y, e.pointerId);
    sendCommand(command);
  }

  /**
   * 处理 pointer cancel 事件
   */
  function onPointerCancel(e: PointerEvent): void {
    if (!videoElement.value) return;

    // 只处理已经按下的触摸点
    if (!activePointers.value.has(e.pointerId)) return;

    // 释放 pointer 捕获
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 忽略错误
    }

    // 获取最后已知的位置
    const lastPos = activePointers.value.get(e.pointerId) || { x: 0.5, y: 0.5 };

    // 移除活跃的触摸点
    activePointers.value.delete(e.pointerId);

    // 发送 up 命令以结束触摸
    const command = createTouchCommand('up', lastPos.x, lastPos.y, e.pointerId);
    sendCommand(command);
  }

  /**
   * 发送返回键
   */
  function sendBackKey(): void {
    const command = createKeyCommand('back');
    sendCommand(command);
  }

  /**
   * 发送主页键
   */
  function sendHomeKey(): void {
    const command = createKeyCommand('home');
    sendCommand(command);
  }

  /**
   * 发送最近任务键
   */
  function sendRecentsKey(): void {
    const command = createKeyCommand('recents');
    sendCommand(command);
  }

  // 组件卸载时清理
  onUnmounted(() => {
    activePointers.value.clear();
  });

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    sendBackKey,
    sendHomeKey,
    sendRecentsKey,
    activePointers,
  };
}
