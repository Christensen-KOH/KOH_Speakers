import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

import { Subject } from '../core/Subject';
import { RoomRegistry } from '../../server/rooms.ts';
import type { Peer as RoomPeer } from '../../server/rooms.ts';

import type { ConnectionStatus, LiveTransport } from './LiveClient';
import { CODE_LENGTH, ClientMessage, normalizeCode, ServerMessage } from './protocol';

// Public room ids on the PeerJS cloud: tankkit-coop-<6-digit code>.
export const PEER_ID_PREFIX = 'tankkit-coop-';

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const MAX_CODE_ATTEMPTS = 5;
const REGISTRY_TICK_MS = 1000;

function makeToken(): string {
  const crypto = globalThis.crypto as Crypto | undefined;
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}

function errorMessage(code: 'bad-request' | 'room-not-found', message: string): ServerMessage {
  return { type: 'error', code, message };
}

/**
 * Serverless transport over PeerJS (WebRTC). The host's browser runs the
 * room registry (the same logic as the Node server) and students connect to
 * it directly through the free PeerJS cloud broker, so live co-op works from
 * GitHub Pages with no backend. Which side this device is follows from the
 * first message sent: host:create / host:resume makes it the host, anything
 * else (join) makes it a student.
 */
export class PeerLiveClient implements LiveTransport {
  public readonly message = new Subject<ServerMessage>();
  public readonly opened = new Subject<void>();
  public readonly statusChanged = new Subject<ConnectionStatus>();

  private status: ConnectionStatus = 'idle';
  private wanted = false;

  // Host
  private registry: RoomRegistry | null = null;
  private registryTimer: number = null;
  private hostPeer: Peer | null = null;
  private hostReady = false;
  private hostQueue: ServerMessage[] = [];
  private codeAttempts = 0;
  private lastCreate: ClientMessage | null = null;
  private readonly localPeer: RoomPeer = { send: (message) => this.deliverToHost(message) };

  // Student
  private studentPeer: Peer | null = null;
  private connection: DataConnection | null = null;
  private joinCode = '';
  private studentQueue: ClientMessage[] = [];
  private retries = 0;
  private retryTimer: number = null;

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connect(): void {
    this.wanted = true;
    // Nothing to dial until the first message says what this device is
    this.setStatus('open');
    this.opened.notify(null);
  }

  public disconnect(): void {
    this.wanted = false;
    window.clearTimeout(this.retryTimer);
    this.teardownHost();
    this.teardownStudent();
    this.setStatus('idle');
  }

  public send(message: ClientMessage): boolean {
    if (this.registry !== null) {
      this.registry.handle(this.localPeer, message);
      return true;
    }
    if (message.type === 'host:create') {
      this.codeAttempts = 0;
      this.startHost(message);
      return true;
    }
    if (message.type === 'host:resume') {
      // Rooms live in the host's memory: a reload loses them
      this.emit(errorMessage('room-not-found', 'That game is no longer available.'));
      return false;
    }
    return this.sendAsStudent(message);
  }

  // --- Host ----------------------------------------------------------------

  private startHost(createMessage: ClientMessage): void {
    this.teardownHost();
    this.lastCreate = createMessage;
    this.registry = new RoomRegistry({ makeToken });
    this.registryTimer = window.setInterval(() => this.registry?.tick(), REGISTRY_TICK_MS);
    this.registry.handle(this.localPeer, createMessage);
  }

  private deliverToHost(message: ServerMessage): void {
    if (message.type === 'host:created' && this.hostPeer === null) {
      this.openHostPeer(message.code);
    }
    if (!this.hostReady) {
      // Hold the code back until students can actually reach it
      this.hostQueue.push(message);
      return;
    }
    this.emit(message);
  }

  private openHostPeer(code: string): void {
    this.setStatus('connecting');
    const peer = new Peer(`${PEER_ID_PREFIX}${code}`, PEER_CONFIG);
    this.hostPeer = peer;

    peer.on('open', () => {
      this.hostReady = true;
      this.setStatus('open');
      this.hostQueue.forEach((queued) => this.emit(queued));
      this.hostQueue = [];
    });
    peer.on('connection', (connection) => this.acceptStudent(connection));
    peer.on('disconnected', () => {
      // Lost the broker (not the students): re-register to stay joinable
      if (this.hostPeer === peer && !peer.destroyed) {
        peer.reconnect();
      }
    });
    peer.on('error', (error) => {
      if (this.hostPeer !== peer) {
        return;
      }
      if ((error as { type?: string }).type === 'unavailable-id') {
        this.retryHostWithNewCode();
      } else if (!this.hostReady) {
        this.teardownHost();
        this.setStatus('idle');
        this.emit(
          errorMessage(
            'bad-request',
            'Could not reach the PeerJS cloud. Check your internet connection and try again.',
          ),
        );
      }
    });
  }

  private retryHostWithNewCode(): void {
    const create = this.lastCreate;
    this.codeAttempts += 1;
    this.teardownHost();
    if (create === null || this.codeAttempts >= MAX_CODE_ATTEMPTS) {
      this.setStatus('idle');
      this.emit(errorMessage('bad-request', 'Could not reserve a room code. Please try again.'));
      return;
    }
    this.startHost(create);
  }

  private acceptStudent(connection: DataConnection): void {
    const student: RoomPeer = {
      send: (message) => {
        if (connection.open) {
          connection.send(message);
        }
      },
    };
    connection.on('data', (data) => this.registry?.handle(student, data));
    connection.on('close', () => this.registry?.disconnect(student));
    connection.on('error', () => this.registry?.disconnect(student));
  }

  private teardownHost(): void {
    window.clearInterval(this.registryTimer);
    this.registryTimer = null;
    this.registry = null;
    this.hostReady = false;
    this.hostQueue = [];
    if (this.hostPeer !== null) {
      const peer = this.hostPeer;
      this.hostPeer = null;
      peer.destroy();
    }
  }

  // --- Student -------------------------------------------------------------

  private sendAsStudent(message: ClientMessage): boolean {
    if (message.type === 'join') {
      this.joinCode = normalizeCode(message.code);
      if (this.joinCode.length !== CODE_LENGTH) {
        this.emit(errorMessage('room-not-found', 'No game with that code.'));
        return false;
      }
    }
    if (this.connection !== null && this.connection.open) {
      this.connection.send(message);
      return true;
    }
    if (this.joinCode === '') {
      return false;
    }
    // Only the join waits for the data channel; stale game traffic is dropped
    if (message.type === 'join') {
      this.studentQueue = [message];
      if (this.studentPeer === null) {
        this.dial();
      }
      return true;
    }
    return false;
  }

  private dial(): void {
    this.setStatus(this.retries === 0 ? 'connecting' : 'reconnecting');
    const peer = new Peer(PEER_CONFIG);
    this.studentPeer = peer;

    peer.on('open', () => {
      const connection = peer.connect(`${PEER_ID_PREFIX}${this.joinCode}`, { reliable: true });
      this.connection = connection;

      connection.on('open', () => {
        const wasRetry = this.retries > 0;
        this.retries = 0;
        this.setStatus('open');
        this.studentQueue.forEach((queued) => connection.send(queued));
        this.studentQueue = [];
        if (wasRetry) {
          // New channel: LiveSession re-sends its join to re-identify
          this.opened.notify(null);
        }
      });
      connection.on('data', (data) => this.emit(data as ServerMessage));
      connection.on('close', () => this.handleStudentDrop(peer));
      connection.on('error', () => this.handleStudentDrop(peer));
    });

    peer.on('error', (error) => {
      if (this.studentPeer !== peer) {
        return;
      }
      if ((error as { type?: string }).type === 'peer-unavailable') {
        this.teardownStudent();
        this.setStatus('open');
        this.emit(
          errorMessage('room-not-found', 'No game with that code. Check the code with your teacher.'),
        );
      } else {
        this.handleStudentDrop(peer);
      }
    });
  }

  private handleStudentDrop(peer: Peer): void {
    if (this.studentPeer !== peer) {
      return;
    }
    this.teardownStudent(false);
    if (!this.wanted || this.joinCode === '') {
      this.setStatus('idle');
      return;
    }
    this.setStatus('reconnecting');
    const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)];
    this.retries += 1;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (this.wanted && this.studentPeer === null && this.joinCode !== '') {
        this.dial();
      }
    }, delay);
  }

  private teardownStudent(forget = true): void {
    if (this.connection !== null) {
      this.connection.close();
      this.connection = null;
    }
    if (this.studentPeer !== null) {
      const peer = this.studentPeer;
      this.studentPeer = null;
      peer.destroy();
    }
    if (forget) {
      this.joinCode = '';
      this.studentQueue = [];
      this.retries = 0;
      window.clearTimeout(this.retryTimer);
    }
  }

  private emit(message: ServerMessage): void {
    // Async like a socket, so callers finish their current step first
    queueMicrotask(() => this.message.notify(message));
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusChanged.notify(status);
    }
  }
}
