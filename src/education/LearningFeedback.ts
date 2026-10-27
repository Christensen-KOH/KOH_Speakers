/**
 * Learning Feedback System
 * Tracks player performance during the level and provides arcade-toned feedback.
 * Non-academic, encouraging tone to maintain game flow.
 */

import { Subject } from '../core/Subject';

export interface LevelPerformance {
    totalQuestionsAnswered: number;
    correctAnswers: number;
    wrongAnswers: number;
    accuracyPercent: number;
    timeSpentFrozen: number; // seconds player was frozen waiting for question
    enemiesDefeated: number;
    bulletsFired: number;
    healthRemaining: number;
}

export interface LevelFeedback {
    title: string;
    messages: string[];
    performanceRating: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    earnedPoints: number;
}

export class LearningFeedbackSystem {
    private performance: LevelPerformance;
    public readonly onLevelComplete = new Subject<LevelFeedback>();

    constructor() {
        this.performance = {
            totalQuestionsAnswered: 0,
            correctAnswers: 0,
            wrongAnswers: 0,
            accuracyPercent: 0,
            timeSpentFrozen: 0,
            enemiesDefeated: 0,
            bulletsFired: 0,
            healthRemaining: 0,
        };
    }

    /**
     * Track a question answered.
     */
    public trackQuestionAnswered(isCorrect: boolean): void {
        this.performance.totalQuestionsAnswered++;
        if (isCorrect) {
            this.performance.correctAnswers++;
        } else {
            this.performance.wrongAnswers++;
        }
        this.updateAccuracy();
    }

    /**
     * Track time frozen (waiting for question).
     */
    public trackFrozenTime(seconds: number): void {
        this.performance.timeSpentFrozen += seconds;
    }

    /**
     * Track enemy defeats.
     */
    public trackEnemyDefeated(): void {
        this.performance.enemiesDefeated++;
    }

    /**
     * Track bullets fired.
     */
    public trackBulletFired(): void {
        this.performance.bulletsFired++;
    }

    /**
     * Track health remaining.
     */
    public setHealthRemaining(health: number): void {
        this.performance.healthRemaining = health;
    }

    private updateAccuracy(): void {
        if (this.performance.totalQuestionsAnswered === 0) {
            this.performance.accuracyPercent = 0;
        } else {
            this.performance.accuracyPercent = Math.round(
                (this.performance.correctAnswers /
                    this.performance.totalQuestionsAnswered) *
                100
            );
        }
    }

    /**
     * Generate end-of-level feedback based on performance.
     * Tone: arcade, encouraging, game-first.
     */
    public generateFeedback(): LevelFeedback {
        const rating = this.determineRating();
        const messages = this.generateMessages(rating);
        const points = this.calculatePoints(rating);

        const feedback: LevelFeedback = {
            title: this.getTitleForRating(rating),
            messages,
            performanceRating: rating,
            earnedPoints: points,
        };

        this.onLevelComplete.notify(feedback);
        return feedback;
    }

    private determineRating(
    ): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' {
        // Base on accuracy + survival + enemy count
        const accuracyScore = this.performance.accuracyPercent;
        const survivalBonus = this.performance.healthRemaining > 0 ? 10 : 0;
        const enemyBonus =
            (this.performance.enemiesDefeated / 20) * 10; // Up to 10 points

        const totalScore = accuracyScore + survivalBonus + enemyBonus;

        if (totalScore >= 90) return 'Platinum';
        if (totalScore >= 75) return 'Gold';
        if (totalScore >= 60) return 'Silver';
        return 'Bronze';
    }

    private getTitleForRating(
        rating: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
    ): string {
        const titles = {
            Bronze: '💪 Nice Work!',
            Silver: '⭐ Good Job!',
            Gold: '🌟 Excellent!',
            Platinum: '👑 Perfect Run!',
        };
        return titles[rating];
    }

    private generateMessages(
        rating: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
    ): string[] {
        const messages: string[] = [];

        // Accuracy-based messages
        if (this.performance.accuracyPercent >= 80) {
            messages.push('Your English is sharp! Keep it up!');
        } else if (this.performance.accuracyPercent >= 60) {
            messages.push('Good effort with your English skills!');
        } else {
            messages.push('Keep practicing—you\'ll improve fast!');
        }

        // Enemy defeat message
        if (this.performance.enemiesDefeated > 15) {
            messages.push(`Destroyed ${this.performance.enemiesDefeated} enemies—dominator!`);
        } else if (this.performance.enemiesDefeated > 10) {
            messages.push(`${this.performance.enemiesDefeated} enemies down—solid gameplay!`);
        }

        // Survival bonus
        if (this.performance.healthRemaining > 0) {
            messages.push('You survived! Excellent defense!');
        } else {
            messages.push('Better luck next level!');
        }

        // Frozen time message
        if (this.performance.timeSpentFrozen < 5) {
            messages.push('Lightning-fast answers! ⚡');
        }

        return messages;
    }

    private calculatePoints(
        rating: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
    ): number {
        const basePoints = {
            Bronze: 500,
            Silver: 750,
            Gold: 1000,
            Platinum: 1500,
        };

        let points = basePoints[rating];

        // Bonus for accuracy
        points += this.performance.accuracyPercent * 5;

        // Bonus for enemies
        points += this.performance.enemiesDefeated * 10;

        // Bonus for health
        if (this.performance.healthRemaining > 0) {
            points += this.performance.healthRemaining * 50;
        }

        return Math.round(points);
    }

    public getPerformance(): LevelPerformance {
        return { ...this.performance };
    }

    public reset(): void {
        this.performance = {
            totalQuestionsAnswered: 0,
            correctAnswers: 0,
            wrongAnswers: 0,
            accuracyPercent: 0,
            timeSpentFrozen: 0,
            enemiesDefeated: 0,
            bulletsFired: 0,
            healthRemaining: 0,
        };
    }
}
