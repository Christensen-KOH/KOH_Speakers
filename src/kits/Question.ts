export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export enum QuestionKind {
  // 4 colour tiles, answerable with keys 1-4.
  MultipleChoice = 'multiple_choice',
  // Prompt is spoken via speechSynthesis; the player picks the match.
  Listening = 'listening',
  // Typed answer; any of `answers` is accepted (case-insensitive).
  FillBlank = 'fill_blank',
}

interface QuestionBase {
  id: string;
  prompt: string;
  // Shown and spoken during the post-mistake review and in the report vault.
  explanation?: string;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  kind: QuestionKind.MultipleChoice;
  choices: string[];
  correctIndex: number;
}

export interface ListeningQuestion extends QuestionBase {
  kind: QuestionKind.Listening;
  // Text read aloud; `prompt` is the on-screen instruction.
  speak: string;
  choices: string[];
  correctIndex: number;
}

export interface FillBlankQuestion extends QuestionBase {
  kind: QuestionKind.FillBlank;
  answers: string[];
}

export type Question =
  | MultipleChoiceQuestion
  | ListeningQuestion
  | FillBlankQuestion;

export function isChoiceQuestion(
  question: Question,
): question is MultipleChoiceQuestion | ListeningQuestion {
  return (
    question.kind === QuestionKind.MultipleChoice ||
    question.kind === QuestionKind.Listening
  );
}

/**
 * Normalises typed answers so small differences don't count as mistakes:
 * case, extra spaces, curly apostrophes and trailing punctuation.
 */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,;:]+$/, '')
    .trim();
}

export function isTypedAnswerCorrect(
  question: FillBlankQuestion,
  typed: string,
): boolean {
  const normalized = normalizeAnswer(typed);
  return (
    normalized !== '' &&
    question.answers.some((answer) => normalizeAnswer(answer) === normalized)
  );
}

/** Text of the correct answer, for review screens and pronunciation. */
export function getCorrectAnswerText(question: Question): string {
  if (isChoiceQuestion(question)) {
    return question.choices[question.correctIndex];
  }
  return question.answers[0];
}
