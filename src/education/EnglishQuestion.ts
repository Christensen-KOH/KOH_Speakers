/**
 * English question types and data structures for the educational game layer.
 * Questions are designed for ESL learners (A1-B2 levels).
 */

export enum QuestionType {
    MultipleChoice = 'multiple_choice',
    TrueFalse = 'true_false',
    WordMatching = 'word_matching',
    GrammarCorrection = 'grammar_correction',
}

export interface QuestionOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

export interface EnglishQuestion {
    id: string;
    type: QuestionType;
    prompt: string;
    options: QuestionOption[];
    category: 'vocabulary' | 'grammar' | 'comprehension' | 'phrasal_verbs';
    level: 'A1' | 'A2' | 'B1' | 'B2';
    explanation?: string;
    timeLimit: number; // seconds (2-5 range)
}

/**
 * Question bank organized by level and category.
 * Start with A1 (beginners) and increase with game difficulty.
 */
export const QUESTION_BANK: EnglishQuestion[] = [
    // === A1 LEVEL (Levels 1-3) ===
    {
        id: 'a1_vocab_001',
        type: QuestionType.MultipleChoice,
        prompt: 'What is this? 🐱',
        options: [
            { id: 'opt_a', text: 'Dog', isCorrect: false },
            { id: 'opt_b', text: 'Cat', isCorrect: true },
            { id: 'opt_c', text: 'Bird', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'A1',
        timeLimit: 3,
    },
    {
        id: 'a1_vocab_002',
        type: QuestionType.TrueFalse,
        prompt: 'The sun is hot.',
        options: [
            { id: 'opt_true', text: 'True', isCorrect: true },
            { id: 'opt_false', text: 'False', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'A1',
        timeLimit: 2,
    },
    {
        id: 'a1_grammar_001',
        type: QuestionType.MultipleChoice,
        prompt: 'Complete: "I ___ a student."',
        options: [
            { id: 'opt_a', text: 'is', isCorrect: false },
            { id: 'opt_b', text: 'are', isCorrect: false },
            { id: 'opt_c', text: 'am', isCorrect: true },
        ],
        category: 'grammar',
        level: 'A1',
        timeLimit: 3,
    },
    {
        id: 'a1_vocab_003',
        type: QuestionType.MultipleChoice,
        prompt: 'Which is a color?',
        options: [
            { id: 'opt_a', text: 'Run', isCorrect: false },
            { id: 'opt_b', text: 'Blue', isCorrect: true },
            { id: 'opt_c', text: 'Jump', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'A1',
        timeLimit: 3,
    },
    {
        id: 'a1_grammar_002',
        type: QuestionType.MultipleChoice,
        prompt: 'Complete: "She ___ to school."',
        options: [
            { id: 'opt_a', text: 'go', isCorrect: false },
            { id: 'opt_b', text: 'goes', isCorrect: true },
            { id: 'opt_c', text: 'going', isCorrect: false },
        ],
        category: 'grammar',
        level: 'A1',
        timeLimit: 3,
    },

    // === A2 LEVEL (Levels 4-6) ===
    {
        id: 'a2_vocab_001',
        type: QuestionType.MultipleChoice,
        prompt: 'What do you use to write?',
        options: [
            { id: 'opt_a', text: 'Fork', isCorrect: false },
            { id: 'opt_b', text: 'Pen', isCorrect: true },
            { id: 'opt_c', text: 'Spoon', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'A2',
        timeLimit: 4,
    },
    {
        id: 'a2_grammar_001',
        type: QuestionType.MultipleChoice,
        prompt: 'Complete: "I ___ coffee yesterday."',
        options: [
            { id: 'opt_a', text: 'drink', isCorrect: false },
            { id: 'opt_b', text: 'drank', isCorrect: true },
            { id: 'opt_c', text: 'am drinking', isCorrect: false },
        ],
        category: 'grammar',
        level: 'A2',
        timeLimit: 4,
    },
    {
        id: 'a2_phrase_001',
        type: QuestionType.TrueFalse,
        prompt: '"Look after" means to take care of.',
        options: [
            { id: 'opt_true', text: 'True', isCorrect: true },
            { id: 'opt_false', text: 'False', isCorrect: false },
        ],
        category: 'phrasal_verbs',
        level: 'A2',
        timeLimit: 3,
    },
    {
        id: 'a2_comprehension_001',
        type: QuestionType.MultipleChoice,
        prompt: 'What time is 14:00?',
        options: [
            { id: 'opt_a', text: '2:00 PM', isCorrect: true },
            { id: 'opt_b', text: '12:00 PM', isCorrect: false },
            { id: 'opt_c', text: '4:00 AM', isCorrect: false },
        ],
        category: 'comprehension',
        level: 'A2',
        timeLimit: 3,
    },

    // === B1 LEVEL (Levels 7-9) ===
    {
        id: 'b1_grammar_001',
        type: QuestionType.MultipleChoice,
        prompt: 'Complete: "If I ___ you were sick, I would have helped."',
        options: [
            { id: 'opt_a', text: 'knew', isCorrect: false },
            { id: 'opt_b', text: 'had known', isCorrect: true },
            { id: 'opt_c', text: 'would know', isCorrect: false },
        ],
        category: 'grammar',
        level: 'B1',
        timeLimit: 5,
    },
    {
        id: 'b1_vocab_001',
        type: QuestionType.MultipleChoice,
        prompt: 'What does "persevere" mean?',
        options: [
            { id: 'opt_a', text: 'Give up easily', isCorrect: false },
            { id: 'opt_b', text: 'Continue despite difficulty', isCorrect: true },
            { id: 'opt_c', text: 'Retreat quickly', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'B1',
        timeLimit: 4,
    },
    {
        id: 'b1_phrase_001',
        type: QuestionType.TrueFalse,
        prompt: '"Put up with" means to tolerate.',
        options: [
            { id: 'opt_true', text: 'True', isCorrect: true },
            { id: 'opt_false', text: 'False', isCorrect: false },
        ],
        category: 'phrasal_verbs',
        level: 'B1',
        timeLimit: 3,
    },
    {
        id: 'b1_comprehension_001',
        type: QuestionType.MultipleChoice,
        prompt: 'Complete the sentence: "She is ___ about the exam."',
        options: [
            { id: 'opt_a', text: 'boring', isCorrect: false },
            { id: 'opt_b', text: 'bored', isCorrect: true },
            { id: 'opt_c', text: 'bore', isCorrect: false },
        ],
        category: 'comprehension',
        level: 'B1',
        timeLimit: 4,
    },

    // === B2 LEVEL (Levels 10+) ===
    {
        id: 'b2_grammar_001',
        type: QuestionType.MultipleChoice,
        prompt: 'Which sentence is grammatically correct?',
        options: [
            { id: 'opt_a', text: 'Despite of the rain, we went out.', isCorrect: false },
            { id: 'opt_b', text: 'Despite the rain, we went out.', isCorrect: true },
            { id: 'opt_c', text: 'Although the rain, we went out.', isCorrect: false },
        ],
        category: 'grammar',
        level: 'B2',
        timeLimit: 5,
    },
    {
        id: 'b2_vocab_001',
        type: QuestionType.MultipleChoice,
        prompt: 'What does "ambiguous" mean?',
        options: [
            { id: 'opt_a', text: 'Very clear', isCorrect: false },
            { id: 'opt_b', text: 'Having more than one possible meaning', isCorrect: true },
            { id: 'opt_c', text: 'Completely wrong', isCorrect: false },
        ],
        category: 'vocabulary',
        level: 'B2',
        timeLimit: 5,
    },
    {
        id: 'b2_phrase_001',
        type: QuestionType.TrueFalse,
        prompt: '"Bring about" means to cause something to happen.',
        options: [
            { id: 'opt_true', text: 'True', isCorrect: true },
            { id: 'opt_false', text: 'False', isCorrect: false },
        ],
        category: 'phrasal_verbs',
        level: 'B2',
        timeLimit: 4,
    },
];

/**
 * Select a question appropriate for the current level.
 * Level increases as player progresses through the game (1-35).
 */
export function selectQuestionForLevel(currentLevel: number): EnglishQuestion {
    let targetLevel: 'A1' | 'A2' | 'B1' | 'B2';

    if (currentLevel <= 3) {
        targetLevel = 'A1';
    } else if (currentLevel <= 6) {
        targetLevel = 'A2';
    } else if (currentLevel <= 9) {
        targetLevel = 'B1';
    } else {
        targetLevel = 'B2';
    }

    const filtered = QUESTION_BANK.filter((q) => q.level === targetLevel);
    return filtered[Math.floor(Math.random() * filtered.length)];
}
