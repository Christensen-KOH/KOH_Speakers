import {
  CODE_ALPHABET,
  CODE_LENGTH,
  cleanNickname,
  cleanSettings,
  cleanCoopInput,
  cleanStats,
  combineStats,
  emptyStats,
  isCoopAction,
  isNicknameAllowed,
  MAX_PLAYERS,
  normalizeCode,
} from '../src/live/protocol.ts';
import type {
  LiveErrorCode,
  LiveKit,
  LiveMistakeSummary,
  LiveRoomState,
  LiveSettings,
  LiveStats,
  LiveStatus,
  ServerMessage,
} from '../src/live/protocol.ts';

/** A connected socket, as far as room logic is concerned. */
export interface Peer {
  send(message: ServerMessage): void;
}

interface PlayerRecord {
  id: string;
  token: string;
  nickname: string;
  peer: Peer | null;
  stats: LiveStats;
  // Totals from earlier runs (page reloads) added to the current run.
  carry: LiveStats | null;
}

interface MistakeRecord {
  questionId: string;
  prompt: string;
  correctText: string;
  misses: number;
  wrongAnswers: Map<string, number>;
}

interface Room {
  code: string;
  hostToken: string;
  host: Peer | null;
  kit: LiveKit;
  settings: LiveSettings;
  status: LiveStatus;
  endsAt: number | null;
  players: Map<string, PlayerRecord>;
  mistakes: Map<string, MistakeRecord>;
  // Last time a host or player was connected (for cleanup).
  lastSeen: number;
  dirty: boolean;
  mistakesDirty: boolean;
}

type Role =
  | { kind: 'host'; room: Room }
  | { kind: 'player'; room: Room; playerId: string };

export interface RegistryOptions {
  now?: () => number;
  random?: () => number;
  makeToken?: () => string;
}

const MAX_KIT_QUESTIONS = 500;
const MAX_TRACKED_MISTAKES = 1000;
const MAX_WRONG_ANSWERS_PER_QUESTION = 50;
// Rooms nobody is connected to are dropped after this long.
const ABANDONED_ROOM_MS = 30 * 60 * 1000;
// Finished rooms stay around for late report viewing / reconnects.
const ENDED_ROOM_MS = 3 * 60 * 60 * 1000;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * All live-class rooms. Transport-agnostic: index.ts feeds it parsed
 * messages and disconnects; tests drive it with fake peers.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly roles = new Map<Peer, Role>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly makeToken: () => string;

  constructor(options: RegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.makeToken = options.makeToken ?? (() => globalThis.crypto.randomUUID());
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public handle(peer: Peer, raw: unknown): void {
    if (!raw || typeof raw !== 'object') {
      this.error(peer, 'bad-request', 'Malformed message.');
      return;
    }
    const message = raw as Record<string, unknown>;

    switch (message.type) {
      case 'host:create':
        this.createRoom(peer, message.kit, message.settings);
        break;
      case 'host:resume':
        this.resumeHost(peer, message.code, message.hostToken);
        break;
      case 'host:start':
        this.withHost(peer, (room) => this.startGame(room));
        break;
      case 'host:end':
        this.withHost(peer, (room) => this.endGame(room));
        break;
      case 'host:kick':
        this.withHost(peer, (room) => this.kick(room, message.playerId));
        break;
      case 'join':
        this.join(peer, message.code, message.nickname, message.playerToken, message.resume === true);
        break;
      case 'player:stats':
        this.withPlayer(peer, (room, player) => {
          if (room.status === 'playing') {
            const current = cleanStats(message.stats);
            player.stats = player.carry ? combineStats(player.carry, current) : current;
            room.dirty = true;
          }
        });
        break;
      case 'player:answer':
        this.withPlayer(peer, (room) => {
          if (room.status === 'playing' && message.correct === false) {
            this.recordMistake(room, message);
          }
        });
        break;
      case 'leave':
        this.leave(peer);
        break;
      // Co-op battlefield relay: inputs/actions to the host, world to all
      case 'coop:input':
        this.withPlayer(peer, (room, player) => {
          if (room.status === 'playing') {
            room.host?.send({
              type: 'coop:input',
              playerId: player.id,
              input: cleanCoopInput(message.input),
            });
          }
        });
        break;
      case 'coop:action':
        this.withPlayer(peer, (room, player) => {
          if (room.status === 'playing' && isCoopAction(message.action)) {
            room.host?.send({
              type: 'coop:action',
              playerId: player.id,
              nickname: player.nickname,
              action: message.action,
            });
          }
        });
        break;
      case 'coop:world':
        this.withHost(peer, (room) => {
          if (room.status !== 'playing' || !message.world || typeof message.world !== 'object') {
            return;
          }
          const world = { type: 'coop:world', world: message.world } as ServerMessage;
          room.players.forEach((player) => player.peer?.send(world));
        });
        break;
      default:
        this.error(peer, 'bad-request', 'Unknown message type.');
    }
  }

  public disconnect(peer: Peer): void {
    const role = this.roles.get(peer);
    this.roles.delete(peer);
    if (role === undefined) {
      return;
    }
    const { room } = role;
    if (role.kind === 'host') {
      if (room.host === peer) {
        room.host = null;
      }
    } else {
      const player = room.players.get(role.playerId);
      if (player && player.peer === peer) {
        player.peer = null;
        room.dirty = true;
      }
    }
    room.lastSeen = this.now();
  }

  /** Call about once a second: ends timed-out games, flushes updates. */
  public tick(): void {
    const now = this.now();

    this.rooms.forEach((room, code) => {
      if (room.status === 'playing' && room.endsAt !== null && room.endsAt <= now) {
        this.endGame(room);
      }

      const anyoneConnected =
        room.host !== null ||
        Array.from(room.players.values()).some((player) => player.peer !== null);
      if (anyoneConnected) {
        room.lastSeen = now;
      }

      const expired =
        now - room.lastSeen > ABANDONED_ROOM_MS ||
        (room.status === 'ended' && room.endsAt !== null && now - room.endsAt > ENDED_ROOM_MS);
      if (expired) {
        this.closeRoom(code, room);
        return;
      }

      if (room.dirty) {
        room.dirty = false;
        this.broadcastRoom(room);
      }
      if (room.mistakesDirty && room.host) {
        room.mistakesDirty = false;
        room.host.send({ type: 'host:mistakes', mistakes: this.mistakeSummary(room) });
      }
    });
  }

  // --- Host --------------------------------------------------------------

  private createRoom(peer: Peer, rawKit: unknown, rawSettings: unknown): void {
    if (this.roles.has(peer)) {
      this.error(peer, 'bad-request', 'Already in a game on this connection.');
      return;
    }
    const kit = this.cleanKit(rawKit);
    if (kit === null) {
      this.error(peer, 'bad-request', `A kit needs 1–${MAX_KIT_QUESTIONS} questions.`);
      return;
    }

    const room: Room = {
      code: this.uniqueCode(),
      hostToken: this.makeToken(),
      host: peer,
      kit,
      settings: cleanSettings(rawSettings),
      status: 'lobby',
      endsAt: null,
      players: new Map(),
      mistakes: new Map(),
      lastSeen: this.now(),
      dirty: false,
      mistakesDirty: false,
    };
    this.rooms.set(room.code, room);
    this.roles.set(peer, { kind: 'host', room });

    peer.send({ type: 'host:created', code: room.code, hostToken: room.hostToken });
    peer.send({ type: 'room', room: this.roomState(room) });
  }

  private resumeHost(peer: Peer, rawCode: unknown, token: unknown): void {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (room === undefined || typeof token !== 'string' || token !== room.hostToken) {
      this.error(peer, 'room-not-found', 'That game is no longer available.');
      return;
    }
    if (room.host && room.host !== peer) {
      this.roles.delete(room.host);
    }
    room.host = peer;
    this.roles.set(peer, { kind: 'host', room });
    peer.send({ type: 'host:created', code: room.code, hostToken: room.hostToken });
    peer.send({ type: 'room', room: this.roomState(room) });
    peer.send({ type: 'host:mistakes', mistakes: this.mistakeSummary(room) });
  }

  private startGame(room: Room): void {
    if (room.status !== 'lobby') {
      return;
    }
    room.status = 'playing';
    room.endsAt = this.now() + room.settings.durationMinutes * 60 * 1000;
    this.broadcastRoom(room);
  }

  private endGame(room: Room): void {
    if (room.status === 'ended') {
      return;
    }
    room.status = 'ended';
    room.endsAt = this.now();
    this.broadcastRoom(room);
    if (room.host) {
      room.host.send({ type: 'host:mistakes', mistakes: this.mistakeSummary(room) });
    }
  }

  private kick(room: Room, playerId: unknown): void {
    const player = typeof playerId === 'string' ? room.players.get(playerId) : undefined;
    if (player === undefined) {
      return;
    }
    room.players.delete(player.id);
    if (player.peer) {
      player.peer.send({ type: 'kicked' });
      this.roles.delete(player.peer);
    }
    this.broadcastRoom(room);
  }

  // --- Players -----------------------------------------------------------

  private join(
    peer: Peer,
    rawCode: unknown,
    rawNickname: unknown,
    token: unknown,
    resume: boolean,
  ): void {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (room === undefined) {
      this.error(peer, 'room-not-found', 'No game with that code. Check the code with your teacher.');
      return;
    }

    // Rejoin after a dropped connection keeps the same player
    if (typeof token === 'string' && token !== '') {
      const existing = Array.from(room.players.values()).find((player) => player.token === token);
      if (existing) {
        if (existing.peer && existing.peer !== peer) {
          this.roles.delete(existing.peer);
        }
        existing.peer = peer;
        if (!resume && room.status === 'playing') {
          existing.carry = existing.stats;
        }
        this.roles.set(peer, { kind: 'player', room, playerId: existing.id });
        this.sendJoined(peer, room, existing);
        room.dirty = true;
        return;
      }
    }

    if (room.status === 'ended') {
      this.error(peer, 'game-ended', 'This game has already finished.');
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      this.error(peer, 'room-full', 'This game is full.');
      return;
    }

    const nickname = cleanNickname(rawNickname);
    if (nickname === '') {
      this.error(peer, 'bad-request', 'Please type a nickname.');
      return;
    }
    if (!isNicknameAllowed(nickname)) {
      this.error(peer, 'bad-request', 'Please choose a different nickname.');
      return;
    }

    if (this.roles.has(peer)) {
      this.leave(peer);
    }

    const player: PlayerRecord = {
      id: this.makeToken(),
      token: this.makeToken(),
      nickname: this.uniqueNickname(room, nickname),
      peer,
      stats: emptyStats(),
      carry: null,
    };
    room.players.set(player.id, player);
    this.roles.set(peer, { kind: 'player', room, playerId: player.id });

    this.sendJoined(peer, room, player);
    this.broadcastRoom(room);
  }

  private leave(peer: Peer): void {
    const role = this.roles.get(peer);
    if (role === undefined || role.kind !== 'player') {
      return;
    }
    this.roles.delete(peer);
    const { room } = role;
    // Keep results on the leaderboard once the game has started
    if (room.status === 'lobby') {
      room.players.delete(role.playerId);
    } else {
      const player = room.players.get(role.playerId);
      if (player) {
        player.peer = null;
      }
    }
    this.broadcastRoom(room);
  }

  private recordMistake(room: Room, message: Record<string, unknown>): void {
    const questionId = text(message.questionId, 120);
    if (questionId === '') {
      return;
    }
    let record = room.mistakes.get(questionId);
    if (record === undefined) {
      if (room.mistakes.size >= MAX_TRACKED_MISTAKES) {
        return;
      }
      record = {
        questionId,
        prompt: text(message.prompt, 300),
        correctText: text(message.correctText, 200),
        misses: 0,
        wrongAnswers: new Map(),
      };
      room.mistakes.set(questionId, record);
    }
    record.misses += 1;
    const given = text(message.given, 100).trim();
    if (given !== '' && (record.wrongAnswers.has(given) || record.wrongAnswers.size < MAX_WRONG_ANSWERS_PER_QUESTION)) {
      record.wrongAnswers.set(given, (record.wrongAnswers.get(given) ?? 0) + 1);
    }
    room.mistakesDirty = true;
  }

  // --- Helpers -----------------------------------------------------------

  private withHost(peer: Peer, action: (room: Room) => void): void {
    const role = this.roles.get(peer);
    if (role === undefined || role.kind !== 'host') {
      this.error(peer, 'not-host', 'Only the host can do that.');
      return;
    }
    action(role.room);
  }

  private withPlayer(peer: Peer, action: (room: Room, player: PlayerRecord) => void): void {
    const role = this.roles.get(peer);
    if (role === undefined || role.kind !== 'player') {
      return;
    }
    const player = role.room.players.get(role.playerId);
    if (player) {
      action(role.room, player);
    }
  }

  private sendJoined(peer: Peer, room: Room, player: PlayerRecord): void {
    peer.send({
      type: 'joined',
      playerId: player.id,
      playerToken: player.token,
      nickname: player.nickname,
      kit: room.kit,
    });
    peer.send({ type: 'room', room: this.roomState(room) });
  }

  private broadcastRoom(room: Room): void {
    const message: ServerMessage = { type: 'room', room: this.roomState(room) };
    room.host?.send(message);
    room.players.forEach((player) => player.peer?.send(message));
  }

  private closeRoom(code: string, room: Room): void {
    room.host?.send({ type: 'room:closed' });
    room.players.forEach((player) => player.peer?.send({ type: 'room:closed' }));
    this.roles.forEach((role, peer) => {
      if (role.room === room) {
        this.roles.delete(peer);
      }
    });
    this.rooms.delete(code);
  }

  private roomState(room: Room): LiveRoomState {
    const players = Array.from(room.players.values())
      .map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.peer !== null,
        stats: player.stats,
      }))
      .sort((a, b) => b.stats.cashEarned - a.stats.cashEarned);

    return {
      code: room.code,
      status: room.status,
      kitName: room.kit.name,
      settings: room.settings,
      remainingMs:
        room.status === 'playing' && room.endsAt !== null
          ? Math.max(0, room.endsAt - this.now())
          : null,
      players,
      classCash: players.reduce((sum, player) => sum + player.stats.cashEarned, 0),
    };
  }

  private mistakeSummary(room: Room): LiveMistakeSummary[] {
    return Array.from(room.mistakes.values())
      .sort((a, b) => b.misses - a.misses)
      .slice(0, 50)
      .map((record) => ({
        questionId: record.questionId,
        prompt: record.prompt,
        correctText: record.correctText,
        misses: record.misses,
        wrongAnswers: Array.from(record.wrongAnswers.entries())
          .map(([answer, count]) => ({ text: answer, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3),
      }));
  }

  private cleanKit(raw: unknown): LiveKit | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const kit = raw as Record<string, unknown>;
    if (
      !Array.isArray(kit.questions) ||
      kit.questions.length === 0 ||
      kit.questions.length > MAX_KIT_QUESTIONS
    ) {
      return null;
    }
    return {
      id: text(kit.id, 120) || 'live-kit',
      name: text(kit.name, 80) || 'Live kit',
      level: text(kit.level, 4) || 'A1',
      questions: kit.questions,
    };
  }

  private uniqueCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
  }

  private uniqueNickname(room: Room, nickname: string): string {
    const taken = new Set(
      Array.from(room.players.values()).map((player) => player.nickname.toLowerCase()),
    );
    if (!taken.has(nickname.toLowerCase())) {
      return nickname;
    }
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${nickname.slice(0, 13)} ${suffix}`;
      if (!taken.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  private error(peer: Peer, code: LiveErrorCode, message: string): void {
    peer.send({ type: 'error', code, message });
  }
}
