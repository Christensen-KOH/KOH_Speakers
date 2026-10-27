// Live class protocol, shared by the browser and the Node server
// (server/). Keep this file self-contained and type-strippable: no enums,
// no imports, no parameter properties.

export const LIVE_PATH = '/live';
// GET: { addresses: string[] } of the server's LAN URLs.
export const LIVE_INFO_PATH = '/live-info';
export const MAX_PLAYERS = 60;
export const NICKNAME_MAX_LENGTH = 16;
export const LIVE_DURATION_OPTIONS = [3, 5, 8, 10, 15];
// Six-digit join codes, easy to read out and type on a phone keypad.
export const CODE_ALPHABET = '0123456789';
export const CODE_LENGTH = 6;

// Co-op battlefield: tanks on the shared map, and how often the host
// broadcasts the world.
export const COOP_MAX_TANKS = 8;
// 25Hz: students glide between ticks at 60fps (see WorldReplica).
export const COOP_TICK_MS = 40;

export type LiveStatus = 'lobby' | 'playing' | 'ended';
export type LiveRewardLevel = 'low' | 'balanced' | 'high';

export interface LiveSettings {
  durationMinutes: number;
  // Class-wide cash target; 0 hides it.
  classGoal: number;
  rewardLevel: LiveRewardLevel;
  movementCostsFuel: boolean;
  // Teacher Studio balance for every student device.
  startShells: number;
  startCash: number;
  rewardMultiplier: number;
}

/** Kit as sent over the wire; the client validates questions on receipt. */
export interface LiveKit {
  id: string;
  name: string;
  level: string;
  questions: unknown[];
}

export interface LiveStats {
  cashEarned: number;
  answered: number;
  correct: number;
  streak: number;
  bestStreak: number;
  stage: number;
}

export interface LivePlayerSummary {
  id: string;
  nickname: string;
  connected: boolean;
  stats: LiveStats;
}

export interface LiveMistakeSummary {
  questionId: string;
  prompt: string;
  correctText: string;
  misses: number;
  // Most common wrong answers, most frequent first.
  wrongAnswers: { text: string; count: number }[];
}

export interface LiveRoomState {
  code: string;
  status: LiveStatus;
  kitName: string;
  settings: LiveSettings;
  // Time left when this state was sent (playing), so clients don't depend
  // on their own clocks matching the server's.
  remainingMs: number | null;
  players: LivePlayerSummary[];
  classCash: number;
}

// --- Co-op battlefield ---------------------------------------------------
// The teacher's host runs the one shared battle; students send inputs and
// draw the world snapshots it broadcasts. Rotations are in degrees
// (0 up, 90 right, 180 down, 270 left).

export type CoopAction = 'brick-builder' | 'steel-fortress' | 'auto-turret' | 'emp-blast';
export const COOP_ACTIONS: CoopAction[] = [
  'brick-builder',
  'steel-fortress',
  'auto-turret',
  'emp-blast',
];

export interface CoopLoadout {
  weaponTier: number;
  speedBoost: boolean;
  heavyArmor: boolean;
}

export interface CoopInput {
  // Held direction in degrees, or -1 for none.
  dir: number;
  // Fire held (rapid fire while possible).
  firing: boolean;
  // Bumped on every fire press, so taps shorter than a packet still count.
  fireSeq: number;
  // Direction to face before the shot of this fireSeq (mouse/tap aim), or -1.
  aim: number;
  // Direction to turn toward while standing still (mouse cursor), or -1.
  face: number;
  // Out of fuel: move at crawl speed.
  crawl: boolean;
  // Question sheet or shop open (shown as 💭 over the tank).
  thinking: boolean;
  loadout: CoopLoadout;
}

export interface CoopTankState {
  id: string;
  slot: number;
  // Centre, field coordinates.
  x: number;
  y: number;
  r: number;
  tier: string;
  hp: number;
  maxHp: number;
  moving: boolean;
  thinking: boolean;
  // Shots the host actually fired for this player (clients charge shells).
  shots: number;
  kills: number;
  alive: boolean;
  shield: boolean;
}

export interface CoopEnemyState {
  id: number;
  x: number;
  y: number;
  r: number;
  tier: string;
  variant: string;
  drop: boolean;
  moving: boolean;
}

export interface CoopBulletState {
  id: number;
  x: number;
  y: number;
  r: number;
}

export type CoopEvent =
  | { k: 'boom'; x: number; y: number; big: boolean; variant?: string }
  | { k: 'kill'; slot: number; variant: string; x: number; y: number }
  | { k: 'toast'; text: string }
  | { k: 'wave'; n: number; total: number; boss: boolean }
  | { k: 'baseLost' }
  // Teacher actions: students' tanks hold still / everyone gets cash.
  | { k: 'freeze'; seconds: number }
  | { k: 'bonus'; cash: number };

export interface CoopWorld {
  seq: number;
  stage: number;
  // 52×52 cells of 16px, row-major; sent when the map changes and as a
  // regular keyframe for late joiners. See src/coop/grid.ts.
  grid?: string;
  baseAlive: boolean;
  turret: { x: number; y: number; aim: number } | null;
  tanks: CoopTankState[];
  enemies: CoopEnemyState[];
  bullets: CoopBulletState[];
  events: CoopEvent[];
  wave: { n: number; total: number; boss: boolean } | null;
  // Players without a tank because the battlefield is full.
  waiting: string[];
}

export function emptyCoopInput(): CoopInput {
  return {
    dir: -1,
    firing: false,
    fireSeq: 0,
    aim: -1,
    face: -1,
    crawl: false,
    thinking: false,
    loadout: { weaponTier: 0, speedBoost: false, heavyArmor: false },
  };
}

function cleanRotation(value: unknown): number {
  return value === 0 || value === 90 || value === 180 || value === 270 ? value : -1;
}

export function cleanCoopInput(raw: unknown): CoopInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const loadout = (data.loadout && typeof data.loadout === 'object'
    ? data.loadout
    : {}) as Record<string, unknown>;
  return {
    dir: cleanRotation(data.dir),
    firing: data.firing === true,
    fireSeq: clampInt(data.fireSeq, 0, Number.MAX_SAFE_INTEGER),
    aim: cleanRotation(data.aim),
    face: cleanRotation(data.face),
    crawl: data.crawl === true,
    thinking: data.thinking === true,
    loadout: {
      weaponTier: clampInt(loadout.weaponTier, 0, 3),
      speedBoost: loadout.speedBoost === true,
      heavyArmor: loadout.heavyArmor === true,
    },
  };
}

export function isCoopAction(value: unknown): value is CoopAction {
  return COOP_ACTIONS.includes(value as CoopAction);
}

// --- Client → server -----------------------------------------------------

export type ClientMessage =
  | { type: 'host:create'; kit: LiveKit; settings: LiveSettings }
  | { type: 'host:resume'; code: string; hostToken: string }
  | { type: 'host:start' }
  | { type: 'host:end' }
  | { type: 'host:kick'; playerId: string }
  | {
      type: 'join';
      code: string;
      nickname: string;
      playerToken?: string;
      // true: same run reconnecting; false/absent: a new run (e.g. after a
      // page reload), whose stats are added to the earlier ones.
      resume?: boolean;
    }
  | { type: 'player:stats'; stats: LiveStats }
  | {
      type: 'player:answer';
      questionId: string;
      prompt: string;
      correctText: string;
      given: string;
      correct: boolean;
    }
  | { type: 'leave' }
  | { type: 'coop:input'; input: CoopInput }
  | { type: 'coop:action'; action: CoopAction }
  | { type: 'coop:world'; world: CoopWorld };

// --- Server → client -----------------------------------------------------

export type ServerMessage =
  | { type: 'host:created'; code: string; hostToken: string }
  | {
      type: 'joined';
      playerId: string;
      playerToken: string;
      nickname: string;
      kit: LiveKit;
    }
  | { type: 'room'; room: LiveRoomState }
  | { type: 'host:mistakes'; mistakes: LiveMistakeSummary[] }
  | { type: 'kicked' }
  | { type: 'room:closed' }
  | { type: 'error'; code: LiveErrorCode; message: string }
  // Host → students
  | { type: 'coop:world'; world: CoopWorld }
  // Students → host (via the server, which adds who sent it)
  | { type: 'coop:input'; playerId: string; input: CoopInput }
  | { type: 'coop:action'; playerId: string; nickname: string; action: CoopAction };

export type LiveErrorCode =
  | 'bad-request'
  | 'room-not-found'
  | 'room-full'
  | 'game-ended'
  | 'not-host'
  | 'rate-limited';

// --- Validation helpers (used on both sides) -----------------------------

// Small blocklist for classroom nicknames; matched on letters only so
// spacing and punctuation tricks don't get through.
const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore',
  'slut', 'nigg', 'fag', 'rape', 'nazi', 'porn', 'sex', 'penis', 'vagina',
  'bastard', 'asshole', 'retard',
];

export function isNicknameAllowed(nickname: string): boolean {
  const letters = nickname
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/[^a-z]/g, '');
  return !BLOCKED_WORDS.some((word) => letters.includes(word));
}

/** Trims, collapses spaces, strips control characters and caps length. */
export function cleanNickname(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH);
}

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string'
    ? raw.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH)
    : '';
}

function clampInt(value: unknown, min: number, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function cleanStats(raw: unknown): LiveStats {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const answered = clampInt(data.answered, 0, 100000);
  return {
    cashEarned: clampInt(data.cashEarned, 0, 100000000),
    answered,
    correct: Math.min(answered, clampInt(data.correct, 0, 100000)),
    streak: clampInt(data.streak, 0, 100000),
    bestStreak: clampInt(data.bestStreak, 0, 100000),
    stage: clampInt(data.stage, 1, 999),
  };
}

export function cleanSettings(raw: unknown): LiveSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rewardLevels: LiveRewardLevel[] = ['low', 'balanced', 'high'];
  return {
    durationMinutes: LIVE_DURATION_OPTIONS.includes(data.durationMinutes as number)
      ? (data.durationMinutes as number)
      : 5,
    classGoal: clampInt(data.classGoal, 0, 10000000),
    rewardLevel: rewardLevels.includes(data.rewardLevel as LiveRewardLevel)
      ? (data.rewardLevel as LiveRewardLevel)
      : 'balanced',
    movementCostsFuel: data.movementCostsFuel !== false,
    startShells: clampInt(data.startShells ?? 10, 0, 99),
    startCash: clampInt(data.startCash ?? 0, 0, 9999),
    rewardMultiplier:
      typeof data.rewardMultiplier === 'number' && Number.isFinite(data.rewardMultiplier)
        ? Math.min(5, Math.max(0.5, data.rewardMultiplier))
        : 1,
  };
}

export function emptyStats(): LiveStats {
  return { cashEarned: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0, stage: 1 };
}

/** Stats of a new run added on top of an earlier run's totals. */
export function combineStats(previous: LiveStats, current: LiveStats): LiveStats {
  return {
    cashEarned: previous.cashEarned + current.cashEarned,
    answered: previous.answered + current.answered,
    correct: previous.correct + current.correct,
    streak: current.streak,
    bestStreak: Math.max(previous.bestStreak, current.bestStreak),
    stage: current.stage,
  };
}

export function accuracyOf(stats: LiveStats): number {
  return stats.answered === 0 ? 0 : Math.round((stats.correct / stats.answered) * 100);
}
