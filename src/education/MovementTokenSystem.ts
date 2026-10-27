/**
 * Movement Token System
 * Player needs movement tokens to move. Each token allows 3-5 seconds of free movement.
 * When tokens run out, player freezes and must answer an English question.
 */

import { Subject } from '../core/Subject';

export interface MovementTokenConfig {
    tokensPerQuestion: number; // Default: 1 token per correct answer
    secondsPerToken: number; // Default: 4 seconds per token
    autoRefillOnWrongAnswer: boolean; // If false, wrong answers give no token
}

export class MovementTokenSystem {
    private tokens: number = 0;
    private maxTokens: number = 3; // Start with 3 tokens per level
    private timePerToken: number = 0;
    private tokenExpireTime: number = 0;
    private isMovementFrozen: boolean = false;

    public readonly onTokensChanged = new Subject<number>();
    public readonly onFrozen = new Subject<void>();
    public readonly onUnfrozen = new Subject<void>();

    private config: MovementTokenConfig = {
        tokensPerQuestion: 1,
        secondsPerToken: 4,
        autoRefillOnWrongAnswer: false,
    };

    constructor(config?: Partial<MovementTokenConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        this.timePerToken = this.config.secondsPerToken * 1000; // Convert to ms
        this.refillTokens();
    }

    /**
     * Update token consumption each frame.
     * @param deltaTime Delta time in milliseconds
     */
    public update(deltaTime: number): void {
        if (this.isMovementFrozen) {
            return; // Frozen, not consuming tokens
        }

        if (this.tokens > 0) {
            this.tokenExpireTime -= deltaTime;

            if (this.tokenExpireTime <= 0) {
                this.tokens--;
                this.onTokensChanged.notify(this.tokens);

                if (this.tokens === 0) {
                    this.freeze();
                } else {
                    this.tokenExpireTime = this.timePerToken;
                }
            }
        }
    }

    /**
     * Check if player can move.
     */
    public canMove(): boolean {
        return this.tokens > 0 && !this.isMovementFrozen;
    }

    /**
     * Freeze player movement (triggers question UI).
     */
    public freeze(): void {
        if (this.isMovementFrozen) return;
        this.isMovementFrozen = true;
        this.onFrozen.notify();
    }

    /**
     * Unfreeze player movement.
     */
    public unfreeze(): void {
        if (!this.isMovementFrozen) return;
        this.isMovementFrozen = false;
        this.onUnfrozen.notify();
    }

    /**
     * Award tokens after a correct answer.
     */
    public awardTokens(count: number = this.config.tokensPerQuestion): void {
        this.tokens = Math.min(this.tokens + count, this.maxTokens);
        this.tokenExpireTime = this.timePerToken;
        this.isMovementFrozen = false;
        this.onTokensChanged.notify(this.tokens);
        this.onUnfrozen.notify();
    }

    /**
     * Penalize tokens (optional) for wrong answers (no freeze, just consequence).
     */
    public penalizeTokens(count: number = 1): void {
        this.tokens = Math.max(this.tokens - count, 0);
        this.onTokensChanged.notify(this.tokens);

        if (this.tokens === 0) {
            this.freeze();
        }
    }

    /**
     * Refill tokens at level start.
     */
    public refillTokens(amount: number = this.maxTokens): void {
        this.tokens = amount;
        this.tokenExpireTime = this.timePerToken;
        this.isMovementFrozen = false;
        this.onTokensChanged.notify(this.tokens);
    }

    /**
     * Set max tokens (increases with game difficulty).
     */
    public setMaxTokens(max: number): void {
        this.maxTokens = max;
    }

    public getTokenCount(): number {
        return this.tokens;
    }

    public getMaxTokens(): number {
        return this.maxTokens;
    }

    public isFrozen(): boolean {
        return this.isMovementFrozen;
    }

    public reset(): void {
        this.tokens = 0;
        this.isMovementFrozen = false;
        this.tokenExpireTime = 0;
        this.refillTokens();
    }
}
