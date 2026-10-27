import { CashAccount } from './CashAccount';
import { DEFAULT_ECONOMY_SETTINGS, EconomySettings } from './EconomySettings';
import { PlayerEconomy } from './PlayerEconomy';

/**
 * Match-wide economy state: host settings and one economy per player slot
 * (index matches `Session.players`).
 */
export class EconomySession {
  private settings: EconomySettings = { ...DEFAULT_ECONOMY_SETTINGS };
  private players: PlayerEconomy[] = [];

  constructor(playerCount = 2) {
    this.start(this.settings, playerCount);
  }

  public start(settings: EconomySettings, playerCount = 2): void {
    this.settings = { ...settings };

    const sharedCash = new CashAccount(settings.startCash);
    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      const cash = settings.sharedCash
        ? sharedCash
        : new CashAccount(settings.startCash);
      this.players.push(new PlayerEconomy(this.settings, cash));
    }
  }

  public getSettings(): Readonly<EconomySettings> {
    return this.settings;
  }

  public getPlayer(playerIndex: number): PlayerEconomy {
    return this.players[playerIndex];
  }

  public getPlayers(): PlayerEconomy[] {
    return this.players;
  }
}
