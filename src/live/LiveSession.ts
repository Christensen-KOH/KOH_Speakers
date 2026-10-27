import { Subject } from '../core/Subject';

import type { LiveTransport } from './LiveClient';
import { PeerLiveClient } from './PeerLiveClient';
import {
  CoopAction,
  CoopInput,
  CoopWorld,
  LiveKit,
  LiveMistakeSummary,
  LiveRoomState,
  LiveSettings,
  LiveStats,
  normalizeCode,
  ServerMessage,
} from './protocol';

export type LiveRole = 'none' | 'host' | 'student';

const HOST_STORAGE_KEY = 'tankkit.liveHost';
const PLAYER_STORAGE_KEY = 'tankkit.livePlayer';

interface StoredHost {
  code: string;
  hostToken: string;
}

interface StoredPlayer {
  code: string;
  playerToken: string;
}

// Per-tab storage: a reload resumes, a new tab is a new device identity.
function readStored<T>(key: string): T | null {
  try {
    const json = window.sessionStorage.getItem(key);
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    if (value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Reload-resume just won't work without storage
  }
}

/**
 * This device's part in a live class, as host (teacher) or student.
 * Re-identifies itself on every reconnect so a Wi-Fi blip is invisible.
 */
export class LiveSession {
  public readonly roomChanged = new Subject<LiveRoomState>();
  public readonly mistakesChanged = new Subject<LiveMistakeSummary[]>();
  public readonly errored = new Subject<{ code: string; message: string }>();
  // Student was removed by the teacher, or the room expired.
  public readonly removed = new Subject<'kicked' | 'closed'>();
  // Co-op battlefield. Host: students' inputs and gadget purchases.
  public readonly coopInput = new Subject<{ playerId: string; input: CoopInput }>();
  public readonly coopAction = new Subject<{
    playerId: string;
    nickname: string;
    action: CoopAction;
  }>();
  // Student: world snapshots from the host.
  public readonly worldReceived = new Subject<CoopWorld>();
  public readonly client: LiveTransport;

  private role: LiveRole = 'none';
  private room: LiveRoomState | null = null;
  private roomReceivedAt = 0;
  private mistakes: LiveMistakeSummary[] = [];
  private host: StoredHost | null = null;
  private player: (StoredPlayer & { playerId: string; nickname: string }) | null = null;
  private kit: LiveKit | null = null;
  // Sent on (re)connect until the server confirms.
  private pending: (() => void) | null = null;
  private joinedOnce = false;

  constructor(client: LiveTransport = new PeerLiveClient()) {
    this.client = client;
    client.message.addListener(this.handleMessage);
    client.opened.addListener(() => this.pending?.());
  }

  public getRole(): LiveRole {
    return this.role;
  }

  public getRoom(): LiveRoomState | null {
    return this.room;
  }

  public getMistakes(): LiveMistakeSummary[] {
    return this.mistakes;
  }

  public getKit(): LiveKit | null {
    return this.kit;
  }

  public getPlayerId(): string | null {
    return this.player ? this.player.playerId : null;
  }

  public getNickname(): string | null {
    return this.player ? this.player.nickname : null;
  }

  /** Milliseconds left in the game, extrapolated since the last update. */
  public getRemainingMs(): number | null {
    if (this.room === null || this.room.remainingMs === null) {
      return null;
    }
    return Math.max(0, this.room.remainingMs - (performance.now() - this.roomReceivedAt));
  }

  /** 1-based rank of this student by cash earned, or null. */
  public getRank(): { rank: number; of: number } | null {
    if (this.room === null || this.player === null) {
      return null;
    }
    const index = this.room.players.findIndex((p) => p.id === this.player.playerId);
    return index === -1 ? null : { rank: index + 1, of: this.room.players.length };
  }

  public getStoredHost(): StoredHost | null {
    return readStored<StoredHost>(HOST_STORAGE_KEY);
  }

  // --- Host ----------------------------------------------------------------

  public createGame(kit: LiveKit, settings: LiveSettings): void {
    this.reset('host');
    this.pending = () => this.client.send({ type: 'host:create', kit, settings });
    this.connectAndSend();
  }

  public resumeHost(stored: StoredHost): void {
    this.reset('host');
    this.host = stored;
    this.pending = () =>
      this.client.send({ type: 'host:resume', code: stored.code, hostToken: stored.hostToken });
    this.connectAndSend();
  }

  public startGame(): void {
    this.client.send({ type: 'host:start' });
  }

  public endGame(): void {
    this.client.send({ type: 'host:end' });
  }

  public kick(playerId: string): void {
    this.client.send({ type: 'host:kick', playerId });
  }

  // --- Student -------------------------------------------------------------

  public join(rawCode: string, nickname: string): void {
    const code = normalizeCode(rawCode);
    this.reset('student');
    const stored = readStored<StoredPlayer>(PLAYER_STORAGE_KEY);
    const playerToken = stored && stored.code === code ? stored.playerToken : undefined;

    this.pending = () =>
      this.client.send({
        type: 'join',
        code,
        nickname,
        playerToken: this.player ? this.player.playerToken : playerToken,
        // After the first successful join, reconnects continue the same run
        resume: this.joinedOnce,
      });
    this.connectAndSend();
  }

  /** Host: broadcast the battlefield to every student. */
  public sendWorld(world: CoopWorld): void {
    if (this.role === 'host') {
      this.client.send({ type: 'coop:world', world });
    }
  }

  /** Student: this device's controls for its tank. */
  public sendCoopInput(input: CoopInput): void {
    if (this.role === 'student') {
      this.client.send({ type: 'coop:input', input });
    }
  }

  /** Student: a battlefield gadget bought in the shop. */
  public sendCoopAction(action: CoopAction): void {
    if (this.role === 'student') {
      this.client.send({ type: 'coop:action', action });
    }
  }

  public sendStats(stats: LiveStats): void {
    if (this.role === 'student') {
      this.client.send({ type: 'player:stats', stats });
    }
  }

  public sendAnswer(answer: {
    questionId: string;
    prompt: string;
    correctText: string;
    given: string;
    correct: boolean;
  }): void {
    if (this.role === 'student') {
      this.client.send({ type: 'player:answer', ...answer });
    }
  }

  /** Leaves the class (student) or stops hosting; forgets stored ids. */
  public leave(): void {
    if (this.role === 'student') {
      this.client.send({ type: 'leave' });
      writeStored(PLAYER_STORAGE_KEY, null);
    }
    if (this.role === 'host') {
      writeStored(HOST_STORAGE_KEY, null);
    }
    this.reset('none');
    this.client.disconnect();
  }

  private connectAndSend(): void {
    if (this.client.getStatus() === 'open') {
      this.pending?.();
    } else {
      this.client.connect();
    }
  }

  private reset(role: LiveRole): void {
    this.role = role;
    this.room = null;
    this.mistakes = [];
    this.host = null;
    this.player = null;
    this.kit = null;
    this.pending = null;
    this.joinedOnce = false;
  }

  private handleMessage = (message: ServerMessage): void => {
    switch (message.type) {
      case 'host:created':
        this.host = { code: message.code, hostToken: message.hostToken };
        writeStored(HOST_STORAGE_KEY, this.host);
        // Reconnects resume rather than create a second game
        this.pending = () =>
          this.client.send({
            type: 'host:resume',
            code: this.host.code,
            hostToken: this.host.hostToken,
          });
        break;
      case 'joined':
        this.player = {
          code: this.room?.code ?? '',
          playerToken: message.playerToken,
          playerId: message.playerId,
          nickname: message.nickname,
        };
        this.kit = message.kit;
        this.joinedOnce = true;
        break;
      case 'room':
        this.room = message.room;
        this.roomReceivedAt = performance.now();
        if (this.player !== null && this.player.code === '') {
          this.player.code = message.room.code;
        }
        if (this.player !== null) {
          writeStored(PLAYER_STORAGE_KEY, {
            code: message.room.code,
            playerToken: this.player.playerToken,
          });
        }
        this.roomChanged.notify(message.room);
        break;
      case 'coop:world':
        this.worldReceived.notify(message.world);
        break;
      case 'coop:input':
        this.coopInput.notify({ playerId: message.playerId, input: message.input });
        break;
      case 'coop:action':
        this.coopAction.notify({
          playerId: message.playerId,
          nickname: message.nickname,
          action: message.action,
        });
        break;
      case 'host:mistakes':
        this.mistakes = message.mistakes;
        this.mistakesChanged.notify(message.mistakes);
        break;
      case 'kicked':
      case 'room:closed':
        writeStored(PLAYER_STORAGE_KEY, null);
        if (this.role === 'host') {
          writeStored(HOST_STORAGE_KEY, null);
        }
        this.pending = null;
        this.removed.notify(message.type === 'kicked' ? 'kicked' : 'closed');
        break;
      case 'error':
        // A failed resume/join must not be retried on every reconnect
        if (message.code === 'room-not-found' || message.code === 'game-ended') {
          this.pending = null;
          if (this.role === 'host') {
            writeStored(HOST_STORAGE_KEY, null);
          }
        }
        this.errored.notify({ code: message.code, message: message.message });
        break;
      default:
        break;
    }
  };
}
