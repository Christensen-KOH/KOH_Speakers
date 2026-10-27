import { Subject } from '../core/Subject';

/**
 * Cash balance. Split out of the player economy so co-op players can share a
 * single account.
 */
export class CashAccount {
  public readonly changed = new Subject<number>();
  private balance: number;
  private totalEarned = 0;

  constructor(startBalance = 0) {
    this.balance = startBalance;
  }

  public getBalance(): number {
    return this.balance;
  }

  public getTotalEarned(): number {
    return this.totalEarned;
  }

  public canAfford(amount: number): boolean {
    return this.balance >= amount;
  }

  public earn(amount: number): void {
    this.balance += amount;
    this.totalEarned += amount;
    this.changed.notify(this.balance);
  }

  public spend(amount: number): boolean {
    if (!this.canAfford(amount)) {
      return false;
    }
    this.balance -= amount;
    this.changed.notify(this.balance);
    return true;
  }
}
