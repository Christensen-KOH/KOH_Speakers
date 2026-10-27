import {
  COOP_MAX_TANKS,
  CoopInput,
  emptyCoopInput,
  LivePlayerSummary,
} from '../live/protocol';

// A dropped student keeps their tank this long before the seat is freed.
export const SEAT_GRACE_MS = 15_000;

export interface CoopSeat {
  playerId: string;
  nickname: string;
  slot: number;
  input: CoopInput;
  // Shots the host fired for this player (students charge shells from it).
  shots: number;
  kills: number;
  disconnectedAt: number | null;
}

/**
 * Host-side seating for the shared battlefield: up to COOP_MAX_TANKS
 * students get a tank slot in join order; the rest wait. Seats survive
 * stage changes and short disconnects.
 */
export class CoopRoster {
  private readonly seats: (CoopSeat | null)[] = new Array(COOP_MAX_TANKS).fill(null);
  private waiting: string[] = [];

  /** Reconciles seats with the room's player list. */
  public sync(players: LivePlayerSummary[], now: number): void {
    const byId = new Map(players.map((player) => [player.id, player]));

    this.seats.forEach((seat, slot) => {
      if (seat === null) {
        return;
      }
      const player = byId.get(seat.playerId);
      if (player === undefined) {
        // Kicked or left the lobby
        this.seats[slot] = null;
        return;
      }
      seat.nickname = player.nickname;
      if (player.connected) {
        seat.disconnectedAt = null;
      } else {
        seat.disconnectedAt = seat.disconnectedAt ?? now;
        if (now - seat.disconnectedAt > SEAT_GRACE_MS) {
          this.seats[slot] = null;
        }
      }
    });

    this.waiting = [];
    players.forEach((player) => {
      if (!player.connected || this.seatOf(player.id) !== null) {
        return;
      }
      const slot = this.seats.indexOf(null);
      if (slot === -1) {
        this.waiting.push(player.id);
        return;
      }
      this.seats[slot] = {
        playerId: player.id,
        nickname: player.nickname,
        slot,
        input: emptyCoopInput(),
        shots: 0,
        kills: 0,
        disconnectedAt: null,
      };
    });
  }

  public setInput(playerId: string, input: CoopInput): void {
    const seat = this.seatOf(playerId);
    if (seat !== null) {
      seat.input = input;
    }
  }

  public seatOf(playerId: string): CoopSeat | null {
    return this.seats.find((seat) => seat !== null && seat.playerId === playerId) ?? null;
  }

  public bySlot(slot: number): CoopSeat | null {
    return this.seats[slot] ?? null;
  }

  public getSeats(): CoopSeat[] {
    return this.seats.filter((seat): seat is CoopSeat => seat !== null);
  }

  public getWaiting(): string[] {
    return this.waiting;
  }
}
