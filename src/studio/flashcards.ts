import type { Kit } from '../kits/Kit';
import { isChoiceQuestion, Question, QuestionKind } from '../kits/Question';

export interface Flashcard {
  // Word or prompt on the front.
  front: string;
  // Read aloud by the audio button.
  speak: string;
  // Meaning / answer on the back.
  back: string;
  // Example sentence or explanation, if the kit has one.
  note?: string;
}

export function cardFromQuestion(question: Question): Flashcard {
  if (question.kind === QuestionKind.Listening) {
    return {
      front: question.speak,
      speak: question.speak,
      back: question.choices[question.correctIndex],
      note: question.explanation,
    };
  }
  if (isChoiceQuestion(question)) {
    const answer = question.choices[question.correctIndex];
    return { front: question.prompt, speak: answer, back: answer, note: question.explanation };
  }
  return {
    front: question.prompt,
    speak: question.answers[0],
    back: question.answers.join(' / '),
    note: question.explanation,
  };
}

/** One card per question: the front is what students see or hear first. */
export function cardsFromKit(kit: Kit): Flashcard[] {
  return kit.questions.map(cardFromQuestion);
}

export type { Question };
