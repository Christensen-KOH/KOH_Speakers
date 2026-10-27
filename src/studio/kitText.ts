import { importKit, KitImportResult } from '../kits/KitImport';
import { QuestionKind } from '../kits/Question';
import type { Question } from '../kits/Question';

const PAIR_SEPARATOR = /\s+[-–—=→]\s+/;

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit';
}

function looksLikeLines(text: string): boolean {
  const trimmed = text.trim();
  const first = trimmed.split(/\r?\n/)[0] ?? '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return false;
  }
  if (/^type\s*[,\t]\s*prompt/i.test(first)) {
    return false;
  }
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .every((line) => line.includes('|') || PAIR_SEPARATOR.test(line));
}

/**
 * Plain pasted lines like `go - went | Past simple of go` become type-in
 * questions ("go" → ___, answer "went"). JSON and CSV go to the regular
 * kit importer.
 */
export function parseKitText(text: string, name: string, now = Date.now()): KitImportResult {
  if (text.trim() === '' || !looksLikeLines(text)) {
    return importKit(text, name, now);
  }

  const kitId = `custom-${slug(name)}-${now.toString(36)}`;
  const warnings: string[] = [];
  const questions: Question[] = [];

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }
    const [pair, ...rest] = line.split('|');
    const explanation = rest.join('|').trim();
    const parts = pair.split(PAIR_SEPARATOR);
    const front = (parts[0] ?? '').trim();
    const back = parts.slice(1).join(' - ').trim();
    if (front === '' || back === '') {
      warnings.push(`Line ${index + 1}: needs "word - answer", skipped.`);
      return;
    }
    questions.push({
      id: `${kitId}-q${questions.length + 1}`,
      kind: QuestionKind.FillBlank,
      prompt: `"${front}" → ___`,
      answers: back
        .split(';')
        .map((answer) => answer.trim())
        .filter(Boolean),
      explanation: explanation || undefined,
    });
  });

  if (questions.length === 0) {
    return { kit: null, warnings, error: 'No valid lines found.' };
  }
  return {
    kit: { id: kitId, name, level: 'A1', builtIn: false, questions },
    warnings,
    error: null,
  };
}
