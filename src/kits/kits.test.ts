import { describe, expect, it } from 'vitest';

import { BUILT_IN_KITS } from './builtInKits';
import { exportKit, importKit, parseDelimited } from './KitImport';
import { KitLibrary, KitStore } from './KitLibrary';
import {
  FillBlankQuestion,
  isChoiceQuestion,
  isTypedAnswerCorrect,
  Question,
  QuestionKind,
} from './Question';
import { QuestionQueue } from './QuestionQueue';

function memoryStore(): KitStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function fillQuestion(answers: string[]): FillBlankQuestion {
  return { id: 'f', kind: QuestionKind.FillBlank, prompt: '?', answers };
}

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => fillQuestion([`a${i}`])).map(
    (question, i) => ({ ...question, id: `q${i}` }),
  );
}

describe('built-in kits', () => {
  it('ships A1, A2, B1 and B2 kits', () => {
    expect(BUILT_IN_KITS.map((kit) => kit.level)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('has unique ids and valid choice questions with all three kinds', () => {
    const ids = new Set<string>();
    BUILT_IN_KITS.forEach((kit) => {
      const kinds = new Set(kit.questions.map((question) => question.kind));
      expect(kinds.size).toBe(3);
      kit.questions.forEach((question) => {
        expect(ids.has(question.id)).toBe(false);
        ids.add(question.id);
        if (isChoiceQuestion(question)) {
          expect(question.choices).toHaveLength(4);
          expect(new Set(question.choices).size).toBe(4);
        }
      });
    });
  });
});

describe('isTypedAnswerCorrect', () => {
  it('ignores case, spacing, curly apostrophes and end punctuation', () => {
    const question = fillQuestion(["didn't see", 'did not see']);
    expect(isTypedAnswerCorrect(question, '  Didn’t   SEE. ')).toBe(true);
    expect(isTypedAnswerCorrect(question, 'did not see')).toBe(true);
    expect(isTypedAnswerCorrect(question, 'dont see')).toBe(false);
    expect(isTypedAnswerCorrect(question, '   ')).toBe(false);
  });
});

describe('QuestionQueue', () => {
  it('brings a missed question back after 3-4 turns', () => {
    const queue = new QuestionQueue(questions(10), () => 0);
    const missed = queue.next();
    queue.record(missed.id, false);

    const served: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const question = queue.next();
      served.push(question.id);
      queue.record(question.id, true);
    }

    // random() = 0 → delay 3, so it is served on turn 4
    expect(served.indexOf(missed.id)).toBe(2);
  });

  it('drops a reviewed question from the review list once answered right', () => {
    const queue = new QuestionQueue(questions(6), () => 0.99);
    const missed = queue.next();
    queue.record(missed.id, false);
    expect(queue.getPendingReviewIds()).toEqual([missed.id]);
    queue.record(missed.id, true);
    expect(queue.getPendingReviewIds()).toEqual([]);
  });

  it('does not repeat a question back to back', () => {
    const queue = new QuestionQueue(questions(3));
    let previous = queue.next().id;
    for (let i = 0; i < 30; i += 1) {
      const id = queue.next().id;
      expect(id).not.toBe(previous);
      previous = id;
    }
  });

  it('still serves something from a one-question kit', () => {
    const queue = new QuestionQueue(questions(1));
    expect(queue.next().id).toBe('q0');
    expect(queue.next().id).toBe('q0');
  });
});

describe('importKit', () => {
  it('reads CSV with a header, quotes and all three types', () => {
    const csv = [
      'type,prompt,answer,wrong1,wrong2,wrong3,speak,explanation',
      'choice,"Pick ""went""",went,goed,gone,go,,past of go',
      'listen,What did you hear?,thought,taught,,,thought,',
      'fill,Plural of child?,children|childs,,,,,',
    ].join('\r\n');
    const { kit, warnings, error } = importKit(csv, 'Verbs', 1);

    expect(error).toBeNull();
    expect(warnings).toEqual([]);
    expect(kit.name).toBe('Verbs');
    expect(kit.questions.map((q) => q.kind)).toEqual([
      QuestionKind.MultipleChoice,
      QuestionKind.Listening,
      QuestionKind.FillBlank,
    ]);
    expect(kit.questions[0].prompt).toBe('Pick "went"');
    expect((kit.questions[2] as FillBlankQuestion).answers).toEqual([
      'children',
      'childs',
    ]);
  });

  it('reads headerless tab-separated rows pasted from a spreadsheet', () => {
    const tsv = 'Big opposite?\tsmall\ttall\tlong\nCat baby?\tkitten';
    const { kit } = importKit(tsv);
    expect(kit.questions[0].kind).toBe(QuestionKind.MultipleChoice);
    expect(kit.questions[1].kind).toBe(QuestionKind.FillBlank);
  });

  it('skips bad rows with a line number and keeps the rest', () => {
    const csv = 'prompt,answer,wrong1\nGood?,yes,no\n,missing,prompt';
    const { kit, warnings } = importKit(csv);
    expect(kit.questions).toHaveLength(1);
    expect(warnings).toEqual(['Question 3: missing prompt, skipped.']);
  });

  it('rejects unknown CSV columns and broken JSON', () => {
    expect(importKit('prompt,answer,colour\na,b,c').error).toMatch(/colour/);
    expect(importKit('{"questions": [').error).toMatch(/Invalid JSON/);
    expect(importKit('{"name": "x"}').error).toMatch(/questions/);
  });

  it('round-trips through exportKit', () => {
    const source = BUILT_IN_KITS[2];
    const { kit } = importKit(exportKit(source));
    expect(kit.name).toBe(source.name);
    expect(kit.level).toBe(source.level);
    expect(kit.questions.map(({ id, ...rest }) => rest)).toEqual(
      source.questions.map(({ id, ...rest }) => rest),
    );
  });
});

describe('parseDelimited', () => {
  it('keeps commas and newlines inside quotes', () => {
    expect(parseDelimited('"a,b","c\nd"\ne,f', ',')).toEqual([
      ['a,b', 'c\nd'],
      ['e', 'f'],
    ]);
  });
});

describe('KitLibrary', () => {
  it('saves custom kits and the active kit across instances', () => {
    const store = memoryStore();
    const library = new KitLibrary(store);
    const { kit } = importKit('Q?,A', 'Mine', 5);
    library.saveCustom(kit);
    library.setActive(kit.id);

    const reloaded = new KitLibrary(store);
    expect(reloaded.getActive().name).toBe('Mine');
    expect(reloaded.getAll()).toHaveLength(BUILT_IN_KITS.length + 1);
  });

  it('falls back to the first built-in kit when the active one is deleted', () => {
    const library = new KitLibrary(memoryStore());
    const { kit } = importKit('Q?,A');
    library.saveCustom(kit);
    library.setActive(kit.id);
    library.deleteCustom(kit.id);
    expect(library.getActive().id).toBe(BUILT_IN_KITS[0].id);
  });
});
