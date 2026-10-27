import { Kit } from './Kit';
import { CefrLevel, Question, QuestionKind } from './Question';

export interface KitImportResult {
  kit: Kit | null;
  // Problems with individual rows/questions; those were skipped.
  warnings: string[];
  // Fatal problem; `kit` is null.
  error: string | null;
}

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const MAX_CHOICES = 4;
const CSV_COLUMNS = [
  'type',
  'prompt',
  'answer',
  'wrong1',
  'wrong2',
  'wrong3',
  'speak',
  'explanation',
];

export const CSV_TEMPLATE = [
  'type,prompt,answer,wrong1,wrong2,wrong3,speak,explanation',
  'choice,Yesterday I ___ to school.,went,goed,gone,go,,go → went → gone',
  'listen,Which word did you hear?,thought,taught,though,through,thought,',
  'fill,The plural of "child" is ___.,children,,,,,Irregular plural',
].join('\n');

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'kit'
  );
}

function asLevel(value: unknown): CefrLevel {
  const upper = String(value ?? '').toUpperCase() as CefrLevel;
  return LEVELS.includes(upper) ? upper : 'A1';
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Splits "a|b" answer cells into alternatives. */
function splitAlternatives(value: string): string[] {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

interface RawQuestion {
  type?: string;
  prompt: string;
  answer: string;
  wrong: string[];
  speak: string;
  explanation: string;
}

function buildQuestion(
  raw: RawQuestion,
  id: string,
): { question: Question | null; problem: string | null } {
  if (raw.prompt === '' && raw.speak === '') {
    return { question: null, problem: 'missing prompt' };
  }
  if (raw.answer === '') {
    return { question: null, problem: 'missing answer' };
  }

  const type = (raw.type ?? '').toLowerCase();
  const explanation = raw.explanation || undefined;
  const wrong = raw.wrong.filter((choice) => choice !== '');

  const isFill =
    type === 'fill' ||
    type === 'fill_blank' ||
    type === 'type' ||
    (type === '' && wrong.length === 0);

  if (isFill) {
    return {
      question: {
        id,
        kind: QuestionKind.FillBlank,
        prompt: raw.prompt,
        answers: splitAlternatives(raw.answer),
        explanation,
      },
      problem: null,
    };
  }

  if (wrong.length === 0) {
    return { question: null, problem: 'choice question needs wrong answers' };
  }
  if (wrong.length > MAX_CHOICES - 1) {
    return { question: null, problem: `at most ${MAX_CHOICES} choices` };
  }

  const choices = [raw.answer, ...wrong];
  const isListening =
    type === 'listen' || type === 'listening' || (type === '' && raw.speak);

  if (isListening) {
    return {
      question: {
        id,
        kind: QuestionKind.Listening,
        speak: raw.speak || raw.answer,
        prompt: raw.prompt || 'What did you hear?',
        choices,
        correctIndex: 0,
        explanation,
      },
      problem: null,
    };
  }

  return {
    question: {
      id,
      kind: QuestionKind.MultipleChoice,
      prompt: raw.prompt,
      choices,
      correctIndex: 0,
      explanation,
    },
    problem: null,
  };
}

/** Reads one question object from JSON in any of the supported shapes. */
function rawFromJson(item: Record<string, unknown>): RawQuestion {
  const choices = Array.isArray(item.choices)
    ? item.choices.map(clean)
    : [];
  const answers = Array.isArray(item.answers) ? item.answers.map(clean) : [];

  // Exported/native shape: choices + correctIndex
  let answer = clean(item.answer);
  let wrong = Array.isArray(item.wrong) ? item.wrong.map(clean) : [];
  if (choices.length > 0) {
    const correctIndex =
      typeof item.correctIndex === 'number'
        ? item.correctIndex
        : choices.indexOf(answer);
    answer = choices[correctIndex] ?? '';
    wrong = choices.filter((_, index) => index !== correctIndex);
  } else if (answers.length > 0) {
    answer = answers.join('|');
  }

  const kind = clean(item.kind) || clean(item.type);
  const type =
    kind === QuestionKind.MultipleChoice
      ? 'choice'
      : kind === QuestionKind.Listening
        ? 'listen'
        : kind === QuestionKind.FillBlank
          ? 'fill'
          : kind;

  return {
    type,
    prompt: clean(item.prompt) || clean(item.question),
    answer,
    wrong,
    speak: clean(item.speak),
    explanation: clean(item.explanation),
  };
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function parseCsv(
  text: string,
): { raws: { raw: RawQuestion; line: number }[]; error: string | null } {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const rows = parseDelimited(text, delimiter);

  if (rows.length === 0) {
    return { raws: [], error: 'The file is empty.' };
  }

  // Header is optional. Without one, columns are
  // prompt, answer, wrong1, wrong2, wrong3.
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.includes('prompt') && header.includes('answer');
  const columns = hasHeader
    ? header
    : ['prompt', 'answer', 'wrong1', 'wrong2', 'wrong3'];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const lineOffset = hasHeader ? 2 : 1;

  const unknown = columns.filter(
    (column) => column !== '' && !CSV_COLUMNS.includes(column),
  );
  if (hasHeader && unknown.length > 0) {
    return {
      raws: [],
      error: `Unknown column(s): ${unknown.join(', ')}. Use: ${CSV_COLUMNS.join(', ')}.`,
    };
  }

  const raws = dataRows.map((cells, index) => {
    const get = (name: string): string => {
      const at = columns.indexOf(name);
      return at === -1 ? '' : (cells[at] ?? '').trim();
    };
    return {
      line: index + lineOffset,
      raw: {
        type: get('type'),
        prompt: get('prompt'),
        answer: get('answer'),
        wrong: [get('wrong1'), get('wrong2'), get('wrong3')],
        speak: get('speak'),
        explanation: get('explanation'),
      },
    };
  });

  return { raws, error: null };
}

/**
 * Builds a custom kit from pasted or uploaded text. Accepts JSON (an exported
 * kit, `{ name, questions }` or a bare question array) or CSV/TSV with an
 * optional `type,prompt,answer,wrong1,wrong2,wrong3,speak,explanation`
 * header. Bad rows are skipped and reported in `warnings`.
 */
export function importKit(
  text: string,
  fallbackName = 'My Kit',
  now = Date.now(),
): KitImportResult {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kit: null, warnings: [], error: 'Nothing to import.' };
  }

  let name = fallbackName;
  let level: CefrLevel = 'A1';
  let description: string | undefined;
  let raws: { raw: RawQuestion; line: number }[];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch (error) {
      return {
        kit: null,
        warnings: [],
        error: `Invalid JSON: ${(error as Error).message}`,
      };
    }

    const container = Array.isArray(data)
      ? { questions: data }
      : (data as Record<string, unknown>);
    if (!Array.isArray(container.questions)) {
      return {
        kit: null,
        warnings: [],
        error: 'JSON needs a "questions" array.',
      };
    }

    name = clean(container.name) || name;
    level = asLevel(container.level);
    description = clean(container.description) || undefined;
    raws = container.questions.map((item, index) => ({
      raw: rawFromJson((item ?? {}) as Record<string, unknown>),
      line: index + 1,
    }));
  } else {
    const parsed = parseCsv(trimmed);
    if (parsed.error !== null) {
      return { kit: null, warnings: [], error: parsed.error };
    }
    raws = parsed.raws;
  }

  const kitId = `custom-${slug(name)}-${now.toString(36)}`;
  const warnings: string[] = [];
  const questions: Question[] = [];

  raws.forEach(({ raw, line }) => {
    const { question, problem } = buildQuestion(
      raw,
      `${kitId}-q${questions.length + 1}`,
    );
    if (question === null) {
      warnings.push(`Question ${line}: ${problem}, skipped.`);
    } else {
      questions.push(question);
    }
  });

  if (questions.length === 0) {
    return {
      kit: null,
      warnings,
      error: 'No valid questions found.',
    };
  }

  return {
    kit: { id: kitId, name, level, description, builtIn: false, questions },
    warnings,
    error: null,
  };
}

/** Pretty JSON that `importKit` reads back losslessly. */
export function exportKit(kit: Kit): string {
  const { name, level, description, questions } = kit;
  return JSON.stringify({ name, level, description, questions }, null, 2);
}
