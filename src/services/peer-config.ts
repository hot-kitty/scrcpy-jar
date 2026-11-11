/**
 * PeerJS 配置
 * 包含 STUN/TURN 服务器配置和 Peer 创建工具
 */

import Peer from 'peerjs';

export const PEER_CONFIG = {
  config: {
    iceServers: [
      // STUN 服务器（免费，用于 NAT 穿透发现公网 IP）
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.relay.metered.ca:80' },
      // TURN 服务器（用于无法直连时中继）
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
      {
        urls: 'turns:global.relay.metered.ca:443?transport=tcp',
        username: 'e8dd65c92f6a9f24b4928132',
        credential: 'uWdWNmkhvyqTW1QP',
      },
    ],
    iceCandidatePoolSize: 10,
  },
};

/**
 * 生成分享码
 */
export function generateShareId(prefix = 'SHR'): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}${random}${timestamp}`;
}

/**
 * 创建 PeerJS 实例
 */
export function createPeer(customId?: string): Peer {
  if (customId) {
    return new Peer(customId, PEER_CONFIG);
  }
  return new Peer(PEER_CONFIG);
}

/**
 * 验证分享码格式
 */
export function isValidShareId(shareId: string): boolean {
  return /^SHR[A-Z0-9]{10}$/.test(shareId);
}
