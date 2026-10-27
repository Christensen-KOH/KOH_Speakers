/**
 * Question UI Controller
 * Manages the display and interaction with question pop-ups during gameplay.
 * Questions appear as overlays with fast multiple-choice or true/false options.
 */

import { Subject } from '../core/Subject';
import { EnglishQuestion } from './EnglishQuestion';

export interface QuestionUIConfig {
    displayDuration: number; // Time question stays visible (ms)
    fadeInDuration: number; // Animation duration
    fadeOutDuration: number; // Animation duration
}

export class QuestionUIController {
    private currentQuestion: EnglishQuestion | null = null;
    private isVisible: boolean = false;
    private timeRemaining: number = 0;
    private containerElement: HTMLElement | null = null;
    private selectedOptionId: string | null = null;

    public readonly onQuestionDisplayed = new Subject<EnglishQuestion>();
    public readonly onAnswerSelected = new Subject<{
        questionId: string;
        optionId: string;
        isCorrect: boolean;
    }>();
    public readonly onQuestionHidden = new Subject<void>();

    private config: QuestionUIConfig = {
        displayDuration: 5000, // 5 seconds
        fadeInDuration: 300,
        fadeOutDuration: 300,
    };

    constructor(config?: Partial<QuestionUIConfig>) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
    }

    /**
     * Display a question to the player.
     */
    public displayQuestion(question: EnglishQuestion): void {
        this.currentQuestion = question;
        this.isVisible = true;
        this.timeRemaining = question.timeLimit * 1000; // Convert to ms
        this.selectedOptionId = null;

        this.renderQuestion(question);
        this.onQuestionDisplayed.notify(question);
    }

    /**
     * Update function called each frame.
     */
    public update(deltaTime: number): void {
        if (!this.isVisible || !this.currentQuestion) {
            return;
        }

        this.timeRemaining -= deltaTime;

        // Update timer display
        const timerPercent = Math.max(
            0,
            (this.timeRemaining /
                (this.currentQuestion.timeLimit * 1000)) *
            100
        );
        this.updateTimerDisplay(timerPercent);

        // Auto-timeout if no selection
        if (this.timeRemaining <= 0) {
            this.hideQuestion(false); // Timeout = no selection
        }
    }

    /**
     * Select an answer option.
     */
    public selectAnswer(optionId: string): void {
        if (!this.currentQuestion || !this.isVisible) {
            return;
        }

        const selectedOption = this.currentQuestion.options.find(
            (o) => o.id === optionId
        );
        if (!selectedOption) {
            return;
        }

        this.selectedOptionId = optionId;
        this.highlightSelectedOption(optionId);
        this.disableAllOptions();

        // Notify answer selection
        this.onAnswerSelected.notify({
            questionId: this.currentQuestion.id,
            optionId,
            isCorrect: selectedOption.isCorrect,
        });

        // Auto-hide after a brief delay for visual feedback
        setTimeout(() => this.hideQuestion(selectedOption.isCorrect), 500);
    }

    /**
     * Hide the question UI.
     */
    public hideQuestion(wasCorrect: boolean): void {
        if (!this.isVisible) {
            return;
        }

        this.isVisible = false;
        this.removeQuestionElement();
        this.onQuestionHidden.notify();
    }

    /**
     * Render question HTML element.
     */
    private renderQuestion(question: EnglishQuestion): void {
        // Create container
        const container = document.createElement('div');
        container.className = 'education-question-overlay';
        container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn ${this.config.fadeInDuration}ms ease-out;
    `;

        // Question card
        const card = document.createElement('div');
        card.className = 'question-card';
        card.style.cssText = `
      background: #ffffff;
      border-radius: 12px;
      padding: 30px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      font-family: Arial, sans-serif;
    `;

        // Timer
        const timer = document.createElement('div');
        timer.className = 'question-timer';
        timer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #4CAF50;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: bold;
    `;
        timer.textContent = String(Math.ceil(question.timeLimit));
        card.appendChild(timer);

        // Question prompt
        const prompt = document.createElement('h2');
        prompt.textContent = question.prompt;
        prompt.style.cssText = `
      margin: 0 0 25px 0;
      font-size: 20px;
      color: #333;
      text-align: center;
    `;
        card.appendChild(prompt);

        // Options
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'question-options';
        optionsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

        question.options.forEach((option) => {
            const optionBtn = document.createElement('button');
            optionBtn.dataset.optionId = option.id;
            optionBtn.textContent = option.text;
            optionBtn.style.cssText = `
        padding: 12px 16px;
        background: #f0f0f0;
        border: 2px solid #ddd;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        transition: all 200ms ease;
        text-align: left;
      `;

            optionBtn.onmouseover = () => {
                optionBtn.style.background = '#e8e8e8';
                optionBtn.style.borderColor = '#999';
            };

            optionBtn.onmouseout = () => {
                optionBtn.style.background = '#f0f0f0';
                optionBtn.style.borderColor = '#ddd';
            };

            optionBtn.onclick = () => this.selectAnswer(option.id);
            optionsContainer.appendChild(optionBtn);
        });

        card.appendChild(optionsContainer);

        // Category badge
        const category = document.createElement('span');
        category.style.cssText = `
      display: inline-block;
      margin-top: 20px;
      padding: 4px 12px;
      background: #e3f2fd;
      color: #1976d2;
      font-size: 12px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: bold;
    `;
        category.textContent = question.category.replace('_', ' ');
        card.appendChild(category);

        container.appendChild(card);

        // Add to body
        document.body.appendChild(container);
        this.containerElement = container;
    }

    private highlightSelectedOption(optionId: string): void {
        if (!this.containerElement) return;

        const buttons = this.containerElement.querySelectorAll(
            '[data-option-id]'
        ) as NodeListOf<HTMLButtonElement>;

        buttons.forEach((btn) => {
            if (btn.dataset.optionId === optionId) {
                btn.style.background = '#4CAF50';
                btn.style.color = 'white';
                btn.style.borderColor = '#388E3C';
            }
        });
    }

    private disableAllOptions(): void {
        if (!this.containerElement) return;

        const buttons = this.containerElement.querySelectorAll(
            '[data-option-id]'
        ) as NodeListOf<HTMLButtonElement>;

        buttons.forEach((btn) => {
            btn.style.cursor = 'default';
            btn.onclick = null;
            btn.onmouseover = null;
            btn.onmouseout = null;
        });
    }

    private updateTimerDisplay(percent: number): void {
        if (!this.containerElement) return;

        const timer = this.containerElement.querySelector(
            '.question-timer'
        ) as HTMLElement;
        if (!timer) return;

        const timeLeft = Math.ceil(this.timeRemaining / 1000);
        timer.textContent = String(Math.max(0, timeLeft));

        // Color change: green -> yellow -> red
        if (percent > 50) {
            timer.style.background = '#4CAF50';
        } else if (percent > 25) {
            timer.style.background = '#FFC107';
            timer.style.color = '#333';
        } else {
            timer.style.background = '#F44336';
            timer.style.color = 'white';
        }
    }

    private removeQuestionElement(): void {
        if (this.containerElement && this.containerElement.parentNode) {
            this.containerElement.parentNode.removeChild(this.containerElement);
        }
        this.containerElement = null;
    }

    public isQuestionDisplayed(): boolean {
        return this.isVisible;
    }

    public getCurrentQuestion(): EnglishQuestion | null {
        return this.currentQuestion;
    }

    public clear(): void {
        if (this.isVisible) {
            this.hideQuestion(false);
        }
        this.currentQuestion = null;
        this.selectedOptionId = null;
    }
}
