/**
 * Ammo Currency System
 * Player starts with limited or zero ammo. Must answer questions to gain ammo.
 * Wrong answers don't freeze movement but deny ammo.
 * Enemies are NOT paused during shooting attempts.
 */

import { Subject } from '../core/Subject';

export interface AmmoCurrencyConfig {
    ammoPerCorrectAnswer: number; // Default: 3 bullets
    maxAmmo: number; // Default: 10 bullets per level
    autoRefillOnWrongAnswer: boolean; // Default: false (no ammo on wrong answer)
}

export class AmmoCurrencySystem {
    private ammo: number = 0;
    private maxAmmo: number = 10;

    public readonly onAmmoChanged = new Subject<number>();
    public readonly onAmmoEmpty = new Subject<void>();

    private config: AmmoCurrencyConfig = {
        ammoPerCorrectAnswer: 3,
        maxAmmo: 10,
        autoRefillOnWrongAnswer: false,
    };

    constructor(config?: Partial<AmmoCurrencyConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        this.maxAmmo = this.config.maxAmmo;
        this.refillAmmo();
    }

    /**
     * Check if player can fire.
     */
    public canFire(): boolean {
        return this.ammo > 0;
    }

    /**
     * Attempt to fire. Consumes one ammo if available.
     * @returns true if fire was successful, false if no ammo
     */
    public attemptFire(): boolean {
        if (this.ammo > 0) {
            this.ammo--;
            this.onAmmoChanged.notify(this.ammo);

            if (this.ammo === 0) {
                this.onAmmoEmpty.notify();
            }
            return true;
        }
        return false;
    }

    /**
     * Award ammo after a correct answer.
     */
    public awardAmmo(
        count: number = this.config.ammoPerCorrectAnswer
    ): void {
        this.ammo = Math.min(this.ammo + count, this.maxAmmo);
        this.onAmmoChanged.notify(this.ammo);
    }

    /**
     * No penalty for wrong answers—just no ammo awarded.
     * This maintains arcade pressure without harsh punishment.
     */
    public wrongAnswerNoAmmo(): void {
        // Ammo stays the same. Player must answer more questions.
    }

    /**
     * Refill ammo at level start.
     */
    public refillAmmo(amount?: number): void {
        this.ammo = amount ?? this.maxAmmo;
        this.onAmmoChanged.notify(this.ammo);
    }

    /**
     * Set max ammo (increases with game difficulty).
     */
    public setMaxAmmo(max: number): void {
        this.maxAmmo = max;
    }

    public getAmmo(): number {
        return this.ammo;
    }

    public getMaxAmmo(): number {
        return this.maxAmmo;
    }

    public reset(): void {
        this.refillAmmo();
    }
}
