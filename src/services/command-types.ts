/**
 * 远程控制命令类型定义
 * 用于 WebRTC DataChannel 传输触摸和按键事件
 */

// 触摸命令
export interface TouchCommand {
  type: 'touch';
  action: 'down' | 'move' | 'up';
  x: number;      // 归一化坐标 0-1
  y: number;      // 归一化坐标 0-1
  pointerId: number;
}

// 按键命令
export interface KeyCommand {
  type: 'key';
  key: 'back' | 'home' | 'recents';
}

// 远程控制命令联合类型
export type RemoteControlCommand = TouchCommand | KeyCommand;

/**
 * 序列化命令为 JSON 字符串
 */
export function serializeCommand(cmd: RemoteControlCommand): string {
  return JSON.stringify(cmd);
}

/**
 * 反序列化 JSON 字符串为命令对象
 * 返回 null 如果解析失败或格式无效
 */
export function deserializeCommand(data: string): RemoteControlCommand | null {
  try {
    const parsed = JSON.parse(data);
    
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (parsed.type === 'touch') {
      if (
        typeof parsed.action === 'string' &&
        ['down', 'move', 'up'].includes(parsed.action) &&
        typeof parsed.x === 'number' &&
        typeof parsed.y === 'number' &&
        typeof parsed.pointerId === 'number'
      ) {
        return parsed as TouchCommand;
      }
    } else if (parsed.type === 'key') {
      if (
        typeof parsed.key === 'string' &&
        ['back', 'home', 'recents'].includes(parsed.key)
      ) {
        return parsed as KeyCommand;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 类型守卫：判断是否为 TouchCommand
 */
export function isTouchCommand(cmd: RemoteControlCommand): cmd is TouchCommand {
  return cmd.type === 'touch';
}

/**
 * 类型守卫：判断是否为 KeyCommand
 */
export function isKeyCommand(cmd: RemoteControlCommand): cmd is KeyCommand {
  return cmd.type === 'key';
}
