import { Subject } from '../core/Subject';

import { ClientMessage, LIVE_PATH, ServerMessage } from './protocol';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

function defaultUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${LIVE_PATH}`;
}

/** What LiveSession needs from a connection to the room host or server. */
export interface LiveTransport {
  readonly message: Subject<ServerMessage>;
  readonly opened: Subject<void>;
  readonly statusChanged: Subject<ConnectionStatus>;
  getStatus(): ConnectionStatus;
  connect(): void;
  disconnect(): void;
  send(message: ClientMessage): boolean;
}

/**
 * WebSocket with JSON messages and automatic reconnects. `opened` fires on
 * every (re)connection so the session can re-identify itself.
 */
export class LiveClient implements LiveTransport {
  public readonly message = new Subject<ServerMessage>();
  public readonly opened = new Subject<void>();
  public readonly statusChanged = new Subject<ConnectionStatus>();
  private readonly url: string;
  private socket: WebSocket = null;
  private status: ConnectionStatus = 'idle';
  private retries = 0;
  private retryTimer: number = null;
  private wanted = false;

  constructor(url = defaultUrl()) {
    this.url = url;
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connect(): void {
    this.wanted = true;
    if (this.socket !== null) {
      return;
    }
    this.open();
  }

  public disconnect(): void {
    this.wanted = false;
    window.clearTimeout(this.retryTimer);
    if (this.socket !== null) {
      const socket = this.socket;
      this.socket = null;
      socket.close();
    }
    this.setStatus('idle');
  }

  public send(message: ClientMessage): boolean {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    this.setStatus(this.retries === 0 ? 'connecting' : 'reconnecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retries = 0;
      this.setStatus('open');
      this.opened.notify(null);
    });

    socket.addEventListener('message', (event) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.message.notify(parsed);
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      if (this.wanted) {
        this.scheduleRetry();
      } else {
        this.setStatus('idle');
      }
    });
  }

  private scheduleRetry(): void {
    this.setStatus('reconnecting');
    const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)];
    this.retries += 1;
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (this.wanted && this.socket === null) {
        this.open();
      }
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusChanged.notify(status);
    }
  }
}
