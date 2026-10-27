import { Subject } from '../core/Subject';

import { CashAccount } from './CashAccount';
import { EconomySettings } from './EconomySettings';
import { getPayout, getStreakLevel, Payout } from './PayoutTable';
import { createLoadout, Loadout, SPEED_BOOST_FUEL_FACTOR } from './Shop';

export interface AnswerResult {
  correct: boolean;
  payout: Payout | null;
  streak: number;
  streakLevel: number;
}

/**
 * Per-player resources: Fuel, Shells and Streak, plus a (possibly shared)
 * cash account. Owns the "answer -> resources -> action" rules.
 */
export class PlayerEconomy {
  public readonly changed = new Subject<PlayerEconomy>();
  public readonly answered = new Subject<AnswerResult>();
  public readonly fuelEmptied = new Subject<void>();
  // Player pressed fire with no shells left.
  public readonly fireRefused = new Subject<void>();

  public readonly cash: CashAccount;
  public readonly loadout: Loadout = createLoadout();
  private readonly settings: EconomySettings;
  private fuel: number;
  private shells: number;
  private streak = 0;
  private bestStreak = 0;
  private incomeTier = 0;
  private correctCount = 0;
  private answeredCount = 0;
  // This player's own earnings, even when the cash account is shared.
  private cashEarned = 0;

  constructor(settings: EconomySettings, cash: CashAccount) {
    this.settings = settings;
    this.cash = cash;
    this.fuel = Math.min(settings.startFuel, settings.maxFuel);
    this.shells = settings.startShells;
  }

  public getFuel(): number {
    return this.fuel;
  }

  public getMaxFuel(): number {
    return this.settings.maxFuel;
  }

  public getShells(): number {
    return this.shells;
  }

  public getStreak(): number {
    return this.streak;
  }

  public getBestStreak(): number {
    return this.bestStreak;
  }

  public getStreakLevel(): number {
    return getStreakLevel(this.streak);
  }

  public getIncomeTier(): number {
    return this.incomeTier;
  }

  public setIncomeTier(tier: number): void {
    this.incomeTier = tier;
    this.changed.notify(this);
  }

  public getAccuracy(): number {
    if (this.answeredCount === 0) {
      return 0;
    }
    return this.correctCount / this.answeredCount;
  }

  public getAnsweredCount(): number {
    return this.answeredCount;
  }

  public getCorrectCount(): number {
    return this.correctCount;
  }

  public getCashEarned(): number {
    return this.cashEarned;
  }

  /** Adds cash credited to this player (answers, bounties). */
  public earn(amount: number): void {
    this.cashEarned += amount;
    this.cash.earn(amount);
  }

  public isOutOfFuel(): boolean {
    return this.settings.movementCostsFuel && this.fuel <= 0;
  }

  /**
   * Drains fuel for `deltaTime` seconds of movement and returns the speed
   * multiplier the tank should move with this frame.
   */
  public consumeMovement(deltaTime: number): number {
    if (!this.settings.movementCostsFuel) {
      return 1;
    }
    if (this.fuel <= 0) {
      return this.settings.emptyFuelSpeedFactor;
    }

    const efficiency = this.loadout.speedBoost ? SPEED_BOOST_FUEL_FACTOR : 1;
    this.fuel = Math.max(
      0,
      this.fuel - this.settings.fuelDrainPerSecond * efficiency * deltaTime,
    );
    if (this.fuel === 0) {
      this.fuelEmptied.notify(null);
    }
    this.changed.notify(this);
    return 1;
  }

  /** Spends one shell. Returns false when the tank is out of ammo. */
  public tryFire(): boolean {
    if (this.shells <= 0) {
      this.fireRefused.notify(null);
      return false;
    }
    this.shells -= 1;
    this.changed.notify(this);
    return true;
  }

  public addShells(amount: number): void {
    this.shells += amount;
    this.changed.notify(this);
  }

  public addFuel(amount: number): void {
    this.fuel = Math.min(this.settings.maxFuel, this.fuel + amount);
    this.changed.notify(this);
  }

  public recordAnswer(correct: boolean): AnswerResult {
    this.answeredCount += 1;

    let payout: Payout | null = null;
    if (correct) {
      payout = getPayout(
        this.streak,
        this.settings.rewardLevel,
        this.incomeTier,
        this.settings.rewardMultiplier,
      );
      this.correctCount += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.shells += payout.shells;
      this.fuel = Math.min(this.settings.maxFuel, this.fuel + payout.fuel);
      this.earn(payout.cash);
    } else {
      this.streak = 0;
    }

    const result: AnswerResult = {
      correct,
      payout,
      streak: this.streak,
      streakLevel: this.getStreakLevel(),
    };
    this.answered.notify(result);
    this.changed.notify(this);
    return result;
  }
}
