/**
 * Education Game Manager
 * Central coordinator for all English-learning systems.
 * Integrates movement tokens, ammo currency, questions, and feedback.
 */

import { Subject } from '../core/Subject';
import { EnglishQuestion, selectQuestionForLevel } from './EnglishQuestion';
import { QuestionUIController } from './QuestionUIController';
import { MovementTokenSystem } from './MovementTokenSystem';
import { AmmoCurrencySystem } from './AmmoCurrencySystem';
import { LearningFeedbackSystem, LevelFeedback } from './LearningFeedback';

export interface EducationGameConfig {
    enableMovementTokens: boolean;
    enableAmmoCurrency: boolean;
    enablePowerUpQuestions: boolean;
    questionFrequency: 'frequent' | 'moderate' | 'sparse'; // How often questions appear
}

export class EducationGameManager {
    private currentLevel: number = 1;
    private isLevelActive: boolean = false;

    // Sub-systems
    private questionUI: QuestionUIController;
    private movementTokens: MovementTokenSystem;
    private ammoCurrency: AmmoCurrencySystem;
    private feedback: LearningFeedbackSystem;

    // Events
    public readonly onQuestionAnswered = new Subject<{
        isCorrect: boolean;
        question: EnglishQuestion;
    }>();

    public readonly onMovementFrozen = new Subject<void>();
    public readonly onMovementUnfrozen = new Subject<void>();
    public readonly onLevelComplete = new Subject<LevelFeedback>();

    private config: EducationGameConfig = {
        enableMovementTokens: true,
        enableAmmoCurrency: true,
        enablePowerUpQuestions: true,
        questionFrequency: 'moderate',
    };

    private pendingQuestion: EnglishQuestion | null = null;
    private frozenTimeStarted: number = 0;

    constructor(config?: Partial<EducationGameConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // Initialize sub-systems
        this.questionUI = new QuestionUIController();
        this.movementTokens = new MovementTokenSystem();
        this.ammoCurrency = new AmmoCurrencySystem();
        this.feedback = new LearningFeedbackSystem();

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Question UI events
        this.questionUI.onAnswerSelected.addListener((event) => {
            this.handleAnswerSelected(event.isCorrect, event.questionId);
        });

        // Movement token events
        this.movementTokens.onFrozen.addListener(() => {
            this.onMovementFrozen.notify();
            this.frozenTimeStarted = Date.now();
            // Trigger a question
            this.requestQuestion('movement');
        });

        this.movementTokens.onUnfrozen.addListener(() => {
            if (this.frozenTimeStarted > 0) {
                const frozenMs = Date.now() - this.frozenTimeStarted;
                this.feedback.trackFrozenTime(frozenMs / 1000);
                this.frozenTimeStarted = 0;
            }
            this.onMovementUnfrozen.notify();
        });
    }

    /**
     * Initialize a new level.
     */
    public startLevel(levelNumber: number): void {
        this.currentLevel = levelNumber;
        this.isLevelActive = true;

        // Adjust difficulty based on level
        const maxTokens = Math.min(3 + Math.floor(levelNumber / 3), 5);
        const maxAmmo = Math.min(5 + Math.floor(levelNumber / 2), 15);

        this.movementTokens.setMaxTokens(maxTokens);
        this.movementTokens.refillTokens(maxTokens);

        this.ammoCurrency.setMaxAmmo(maxAmmo);
        this.ammoCurrency.refillAmmo(Math.floor(maxAmmo / 2)); // Start with half ammo

        this.feedback.reset();
    }

    /**
     * Update called each frame.
     */
    public update(deltaTime: number): void {
        if (!this.isLevelActive) return;

        this.movementTokens.update(deltaTime);
        this.questionUI.update(deltaTime);
    }

    /**
     * Request a question (triggered by movement freeze or power-up collection).
     */
    private requestQuestion(source: 'movement' | 'shooting' | 'powerup'): void {
        const question = selectQuestionForLevel(this.currentLevel);
        this.pendingQuestion = question;
        this.questionUI.displayQuestion(question);
    }

    /**
     * Handle power-up collection (triggers a question).
     */
    public powerupCollected(powerupType: string): void {
        if (!this.config.enablePowerUpQuestions) return;

        // Show a quick question
        const question = selectQuestionForLevel(this.currentLevel);
        this.pendingQuestion = question;
        this.questionUI.displayQuestion(question);
    }

    /**
     * Check if player can move.
     */
    public canMove(): boolean {
        return this.movementTokens.canMove();
    }

    /**
     * Check if player can fire.
     */
    public canFire(): boolean {
        return this.ammoCurrency.canFire();
    }

    /**
     * Record a bullet fired.
     */
    public bulletFired(): void {
        this.feedback.trackBulletFired();
        if (this.ammoCurrency.attemptFire()) {
            // Successful shot
        }
    }

    /**
     * Attempt to fire (triggers question if no ammo).
     */
    public attemptFire(): boolean {
        if (this.ammoCurrency.canFire()) {
            this.ammoCurrency.attemptFire();
            return true;
        } else {
            // No ammo - trigger question
            this.requestQuestion('shooting');
            return false;
        }
    }

    /**
     * Record an enemy defeated.
     */
    public enemyDefeated(): void {
        this.feedback.trackEnemyDefeated();
    }

    /**
     * Record player health.
     */
    public setPlayerHealth(health: number): void {
        this.feedback.setHealthRemaining(health);
    }

    /**
     * End the level and generate feedback.
     */
    public completeLevel(): void {
        this.isLevelActive = false;
        const feedback = this.feedback.generateFeedback();
        this.onLevelComplete.notify(feedback);
    }

    private handleAnswerSelected(
        isCorrect: boolean,
        questionId: string
    ): void {
        this.feedback.trackQuestionAnswered(isCorrect);

        if (isCorrect) {
            // Reward player
            this.movementTokens.awardTokens(1);
            this.ammoCurrency.awardAmmo(3);
        } else {
            // No reward, but no harsh penalty
            this.ammoCurrency.wrongAnswerNoAmmo();
        }

        this.onQuestionAnswered.notify({
            isCorrect,
            question: this.pendingQuestion!,
        });

        this.pendingQuestion = null;
    }

    // Getters
    public getMovementTokens(): number {
        return this.movementTokens.getTokenCount();
    }

    public getMaxMovementTokens(): number {
        return this.movementTokens.getMaxTokens();
    }

    public getAmmo(): number {
        return this.ammoCurrency.getAmmo();
    }

    public getMaxAmmo(): number {
        return this.ammoCurrency.getMaxAmmo();
    }

    public getCurrentLevel(): number {
        return this.currentLevel;
    }

    public isQuestionDisplayed(): boolean {
        return this.questionUI.isQuestionDisplayed();
    }

    public reset(): void {
        this.movementTokens.reset();
        this.ammoCurrency.reset();
        this.feedback.reset();
        this.isLevelActive = false;
    }
}
