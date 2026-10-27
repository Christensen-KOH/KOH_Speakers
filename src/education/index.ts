/**
 * Educational Game Layer
 * English-learning integration for Battle City.
 * Provides movement tokens, ammo currency, question management, and learning feedback.
 */

export type { EnglishQuestion } from './EnglishQuestion';
export { QuestionType, selectQuestionForLevel, QUESTION_BANK } from './EnglishQuestion';
export { MovementTokenSystem } from './MovementTokenSystem';
export { AmmoCurrencySystem } from './AmmoCurrencySystem';
export { LearningFeedbackSystem } from './LearningFeedback';
export type { LevelFeedback, LevelPerformance } from './LearningFeedback';
export { QuestionUIController } from './QuestionUIController';
export { EducationGameManager } from './EducationGameManager';
