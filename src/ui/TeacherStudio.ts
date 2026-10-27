import type { Kit } from '../kits/Kit';
import { exportKit, CSV_TEMPLATE } from '../kits/KitImport';
import type { KitLibrary } from '../kits/KitLibrary';
import {
  CefrLevel,
  getCorrectAnswerText,
  isChoiceQuestion,
  Question,
  QuestionKind,
} from '../kits/Question';
import { cardsFromKit } from '../studio/flashcards';
import { parseKitText, slug } from '../studio/kitText';
import {
  DEFAULT_STUDIO_SETTINGS,
  EnemySpeed,
  HP_OPTIONS,
  loadStudioSettings,
  REWARD_MULTIPLIER_OPTIONS,
  saveStudioSettings,
  StudioSettings,
} from '../studio/StudioSettings';

import { FlashcardViewer } from './FlashcardViewer';
import { Speech } from './Speech';

import './styles/studio.css';

type Tab = 'kits' | 'flashcards' | 'settings';
type QuestionType = 'mc' | 'listen' | 'fill';

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2'];
const TYPE_LABELS: Record<QuestionType, string> = {
  mc: 'Multiple choice',
  listen: 'Flashcard / Audio listening',
  fill: 'Fill-in-the-blank / Spelling',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement {
  const wrapper = el('label', 'tk-st-field');
  wrapper.append(el('span', 'tk-st-label', label), input);
  if (hint) {
    wrapper.append(el('small', 'tk-st-hint', hint));
  }
  return wrapper;
}

function textInput(value = '', placeholder = ''): HTMLInputElement {
  const input = el('input', 'tk-st-input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

function typeOf(question: Question): QuestionType {
  if (question.kind === QuestionKind.Listening) {
    return 'listen';
  }
  return question.kind === QuestionKind.MultipleChoice ? 'mc' : 'fill';
}

/** Button group acting like radio buttons (mouse and touch friendly). */
function segmented<T extends string | number | boolean>(
  options: [T, string][],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = el('div', 'tk-st-seg');
  group.setAttribute('role', 'radiogroup');
  options.forEach(([optionValue, label]) => {
    const choice = button(label, 'tk-st-seg-btn', () => {
      group.querySelectorAll('.tk-st-seg-btn').forEach((other) => other.classList.remove('is-on'));
      choice.classList.add('is-on');
      onChange(optionValue);
    });
    choice.classList.toggle('is-on', optionValue === value);
    group.append(choice);
  });
  return group;
}

export interface TeacherStudioOptions {
  library: KitLibrary;
  // Starts a live class with this kit (settings are read from storage).
  onLaunch: (kitId: string) => void;
  // Keyboard capture for the game is paused while the studio is open.
  onOpenChanged?: (open: boolean) => void;
}

/**
 * Full-screen teacher admin, separate from the arcade canvas: build and
 * edit kits, flip through flashcards with the class, and set the classroom
 * rules that every live game starts with.
 */
export class TeacherStudio {
  private readonly library: KitLibrary;
  private readonly options: TeacherStudioOptions;
  private readonly speech = new Speech();
  private readonly root = el('div', 'tk-studio');
  private readonly body = el('div', 'tk-st-body');
  private readonly tabs = el('div', 'tk-st-tabs');
  private readonly message = el('div', 'tk-st-message');
  private readonly launchButton: HTMLButtonElement;
  private viewer: FlashcardViewer | null = null;
  private tab: Tab = 'kits';
  private selectedId: string;
  // 'new' = blank form, a question id = editing it, null = closed
  private editing: string | 'new' | null = null;
  private importOpen = false;
  private kitForm: 'new' | 'edit' | null = null;
  private opened = false;

  constructor(options: TeacherStudioOptions) {
    this.options = options;
    this.library = options.library;
    this.selectedId = this.library.getActive().id;

    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Teacher Studio');

    this.launchButton = button(
      '🚀 Launch Live Game with This Kit',
      'tk-st-btn tk-st-btn--go',
      () => this.launch(),
    );
    const header = el('header', 'tk-st-header');
    header.append(
      el('h1', 'tk-st-title', '🎓 Teacher Studio'),
      this.tabs,
      this.launchButton,
      button('✕', 'tk-st-btn tk-st-close', () => this.close()),
    );

    this.root.append(header, this.message, this.body);
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.editing === null) {
        this.close();
      }
    });
    document.body.append(this.root);

    this.library.changed.addListener(() => {
      if (this.opened && this.tab === 'kits') {
        this.render();
      }
    });
  }

  public isOpen(): boolean {
    return this.opened;
  }

  public open(tab: Tab = 'kits'): void {
    this.tab = tab;
    this.opened = true;
    this.root.hidden = false;
    this.options.onOpenChanged?.(true);
    this.render();
  }

  public close(): void {
    this.opened = false;
    this.root.hidden = true;
    this.speech.cancel();
    this.viewer?.destroy();
    this.viewer = null;
    this.options.onOpenChanged?.(false);
  }

  // --- Frame ---------------------------------------------------------------

  private render(): void {
    this.tabs.replaceChildren(
      ...(
        [
          ['kits', '📚 Kits & Questions'],
          ['flashcards', '🃏 Flashcards'],
          ['settings', '⚙️ Class Rules'],
        ] as [Tab, string][]
      ).map(([id, label]) => {
        const node = button(label, 'tk-st-tab', () => {
          this.tab = id;
          this.editing = null;
          this.render();
        });
        node.classList.toggle('is-on', this.tab === id);
        return node;
      }),
    );

    const kit = this.getKit();
    this.launchButton.disabled = kit === null || kit.questions.length === 0;
    this.launchButton.title =
      kit === null ? '' : `Host a live class with "${kit.name}" (${kit.questions.length} questions)`;

    this.viewer?.destroy();
    this.viewer = null;
    this.body.replaceChildren();
    if (this.tab === 'kits') {
      this.renderKits();
    } else if (this.tab === 'flashcards') {
      this.renderFlashcards();
    } else {
      this.renderSettings();
    }
  }

  private getKit(): Kit | null {
    return this.library.get(this.selectedId) ?? this.library.getAll()[0] ?? null;
  }

  private say(text: string, isError = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('is-error', isError);
    this.message.hidden = text === '';
  }

  private launch(): void {
    const kit = this.getKit();
    if (kit === null || kit.questions.length === 0) {
      return;
    }
    this.library.setActive(kit.id);
    this.close();
    this.options.onLaunch(kit.id);
  }

  // --- Tab 1: kits and questions ---------------------------------------------

  private renderKits(): void {
    const layout = el('div', 'tk-st-split');
    layout.append(this.renderKitList(), this.renderKitDetail());
    this.body.append(layout);
  }

  private renderKitList(): HTMLElement {
    const side = el('aside', 'tk-st-side');
    const list = el('div', 'tk-st-kitlist');
    this.library.getAll().forEach((kit) => {
      const row = button('', 'tk-st-kit', () => {
        this.selectedId = kit.id;
        this.editing = null;
        this.kitForm = null;
        this.say('');
        this.render();
      });
      row.classList.toggle('is-on', kit.id === this.selectedId && this.kitForm === null);
      row.append(
        el('span', 'tk-st-kit-name', kit.name),
        el(
          'span',
          'tk-st-kit-meta',
          `${kit.level} · ${kit.questions.length} questions${kit.builtIn ? ' · built-in' : ''}`,
        ),
      );
      list.append(row);
    });

    side.append(
      list,
      button('＋ New kit', 'tk-st-btn', () => {
        this.kitForm = 'new';
        this.editing = null;
        this.render();
      }),
      button('⬆ Import CSV / JSON / text', 'tk-st-btn tk-st-btn--ghost', () => {
        this.importOpen = !this.importOpen;
        this.kitForm = null;
        this.render();
      }),
    );
    return side;
  }

  private renderKitDetail(): HTMLElement {
    const main = el('section', 'tk-st-main');
    if (this.importOpen) {
      main.append(this.renderImport());
    }
    if (this.kitForm !== null) {
      main.append(this.renderKitForm(this.kitForm === 'edit' ? this.getKit() : null));
      return main;
    }

    const kit = this.getKit();
    if (kit === null) {
      main.append(el('p', 'tk-st-empty', 'No kits yet. Create one with “New kit”.'));
      return main;
    }

    main.append(this.renderKitHeader(kit));
    if (this.editing !== null) {
      main.append(this.renderQuestionForm(kit));
    }
    main.append(this.renderQuestionTable(kit));
    return main;
  }

  private renderKitHeader(kit: Kit): HTMLElement {
    const header = el('div', 'tk-st-card');
    const top = el('div', 'tk-st-row');
    top.append(
      el('h2', 'tk-st-h2', kit.name),
      el('span', 'tk-st-badge', kit.level),
      el('span', 'tk-st-spacer'),
    );
    top.append(
      button('⧉ Duplicate', 'tk-st-btn tk-st-btn--small', () => this.duplicateKit(kit)),
      button('⬇ Export JSON', 'tk-st-btn tk-st-btn--small', () => this.downloadKit(kit)),
    );
    if (!kit.builtIn) {
      top.append(
        button('✏️ Edit details', 'tk-st-btn tk-st-btn--small', () => {
          this.kitForm = 'edit';
          this.render();
        }),
        button('🗑 Delete kit', 'tk-st-btn tk-st-btn--small tk-st-btn--danger', () => {
          if (window.confirm(`Delete the kit “${kit.name}” and its questions?`)) {
            this.library.deleteCustom(kit.id);
            this.selectedId = this.library.getActive().id;
            this.say('Kit deleted.');
            this.render();
          }
        }),
      );
    }
    header.append(top);
    if (kit.description) {
      header.append(el('p', 'tk-st-desc', kit.description));
    }
    if (kit.builtIn) {
      header.append(
        el('p', 'tk-st-note', 'Built-in kits are read-only. Duplicate one to make your own copy to edit.'),
      );
    }
    return header;
  }

  private renderKitForm(existing: Kit | null): HTMLElement {
    const kit = existing;
    const card = el('div', 'tk-st-card');
    card.append(el('h2', 'tk-st-h2', kit ? 'Kit details' : 'New kit'));

    const title = textInput(kit?.name ?? '', 'e.g. Irregular verbs');
    const level = el('select', 'tk-st-input');
    LEVELS.forEach((value) => {
      const option = el('option', undefined, value);
      option.value = value;
      option.selected = (kit?.level ?? 'A1') === value;
      level.append(option);
    });
    const description = el('textarea', 'tk-st-input');
    description.rows = 2;
    description.value = kit?.description ?? '';
    description.placeholder = 'What does this kit practise?';

    const actions = el('div', 'tk-st-row');
    actions.append(
      button('Save kit', 'tk-st-btn tk-st-btn--go', () => {
        const name = title.value.trim();
        if (name === '') {
          this.say('Give the kit a title.', true);
          return;
        }
        const saved: Kit = kit
          ? { ...kit, name, level: level.value as CefrLevel, description: description.value.trim() || undefined }
          : {
              id: `custom-${slug(name)}-${Date.now().toString(36)}`,
              name,
              level: level.value as CefrLevel,
              description: description.value.trim() || undefined,
              builtIn: false,
              questions: [],
            };
        this.library.saveCustom(saved);
        this.selectedId = saved.id;
        this.kitForm = null;
        this.say(`Saved “${name}”.`);
        this.render();
      }),
      button('Cancel', 'tk-st-btn tk-st-btn--ghost', () => {
        this.kitForm = null;
        this.render();
      }),
    );
    card.append(
      field('Title', title),
      field('CEFR level', level),
      field('Description', description),
      actions,
    );
    return card;
  }

  private renderQuestionTable(kit: Kit): HTMLElement {
    const card = el('div', 'tk-st-card');
    const head = el('div', 'tk-st-row');
    head.append(el('h3', 'tk-st-h3', `Questions (${kit.questions.length})`), el('span', 'tk-st-spacer'));
    if (!kit.builtIn) {
      head.append(
        button('＋ Add question', 'tk-st-btn tk-st-btn--go tk-st-btn--small', () => {
          this.editing = 'new';
          this.render();
        }),
      );
    }
    card.append(head);

    if (kit.questions.length === 0) {
      card.append(el('p', 'tk-st-empty', 'No questions yet. Add one or import a list.'));
      return card;
    }

    const table = el('table', 'tk-st-table');
    const headRow = el('tr');
    ['#', 'Type', 'Prompt', 'Answer', ''].forEach((label) => headRow.append(el('th', undefined, label)));
    const thead = el('thead');
    thead.append(headRow);
    table.append(thead);
    const bodyEl = el('tbody');
    kit.questions.forEach((question, index) => {
      const row = el('tr');
      const prompt =
        question.kind === QuestionKind.Listening
          ? `🔊 ${question.speak}`
          : question.prompt;
      const actions = el('td', 'tk-st-actions');
      actions.append(
        button('🔊', 'tk-st-icon', () => this.speech.speak(this.spokenText(question))),
      );
      if (!kit.builtIn) {
        actions.append(
          button('✏️', 'tk-st-icon', () => {
            this.editing = question.id;
            this.render();
          }),
          button('🗑', 'tk-st-icon', () => {
            this.library.saveCustom({
              ...kit,
              questions: kit.questions.filter((other) => other.id !== question.id),
            });
            this.render();
          }),
        );
      }
      row.append(
        el('td', undefined, String(index + 1)),
        el('td', undefined, TYPE_LABELS[typeOf(question)].split(' / ')[0]),
        el('td', 'tk-st-cell', prompt),
        el('td', 'tk-st-cell', getCorrectAnswerText(question)),
        actions,
      );
      bodyEl.append(row);
    });
    table.append(bodyEl);
    const wrap = el('div', 'tk-st-tablewrap');
    wrap.append(table);
    card.append(wrap);
    return card;
  }

  private spokenText(question: Question): string {
    return question.kind === QuestionKind.Listening
      ? question.speak
      : question.kind === QuestionKind.FillBlank
        ? question.answers[0]
        : question.prompt;
  }

  // --- Question form ---------------------------------------------------------

  private renderQuestionForm(kit: Kit): HTMLElement {
    const existing =
      this.editing !== 'new' ? kit.questions.find((question) => question.id === this.editing) : undefined;
    let type: QuestionType = existing ? typeOf(existing) : 'mc';

    const card = el('div', 'tk-st-card tk-st-form');
    card.append(el('h3', 'tk-st-h3', existing ? 'Edit question' : 'Add question'));

    const typePicker = segmented<QuestionType>(
      (Object.keys(TYPE_LABELS) as QuestionType[]).map((key) => [key, TYPE_LABELS[key]]),
      type,
      (value) => {
        type = value;
        drawFields();
      },
    );
    const fields = el('div', 'tk-st-fields');
    const actions = el('div', 'tk-st-row');
    let build: () => Question | string = () => 'Choose a question type.';

    const drawFields = (): void => {
      fields.replaceChildren();
      const explanation = textInput(existing?.explanation ?? '', 'Example sentence or tip shown after a mistake');

      if (type === 'mc') {
        const q = existing && existing.kind === QuestionKind.MultipleChoice ? existing : null;
        const prompt = el('textarea', 'tk-st-input');
        prompt.rows = 2;
        prompt.value = q?.prompt ?? '';
        prompt.placeholder = 'Yesterday I ___ to school.';
        const options = [0, 1, 2, 3].map((i) => textInput(q?.choices[i] ?? '', `Option ${i + 1}`));
        let correct = q?.correctIndex ?? 0;
        const optionRows = options.map((input, i) => {
          const row = el('div', 'tk-st-option');
          const radio = el('input');
          radio.type = 'radio';
          radio.name = 'tk-st-correct';
          radio.checked = i === correct;
          radio.title = 'Correct answer';
          radio.addEventListener('change', () => {
            correct = i;
          });
          row.append(radio, input);
          return row;
        });
        fields.append(
          field('Prompt', prompt),
          field('Options (tick the correct one)', el('div', 'tk-st-options')),
          field('Explanation (optional)', explanation),
        );
        fields.querySelector('.tk-st-options')?.append(...optionRows);
        build = () => {
          const filled = options
            .map((input, i) => ({ text: input.value.trim(), i }))
            .filter((option) => option.text !== '');
          if (prompt.value.trim() === '') {
            return 'The question needs a prompt.';
          }
          if (filled.length < 2) {
            return 'Enter at least two options.';
          }
          const index = filled.findIndex((option) => option.i === correct);
          if (index === -1) {
            return 'Tick one of the filled-in options as correct.';
          }
          return {
            id: existing?.id ?? this.newQuestionId(kit),
            kind: QuestionKind.MultipleChoice,
            prompt: prompt.value.trim(),
            choices: filled.map((option) => option.text),
            correctIndex: index,
            explanation: explanation.value.trim() || undefined,
          };
        };
      } else if (type === 'listen') {
        const q = existing && existing.kind === QuestionKind.Listening ? existing : null;
        const word = textInput(q?.speak ?? '', 'e.g. thought');
        const preview = button('🔊 Preview audio', 'tk-st-btn tk-st-btn--small', () =>
          this.speech.speak(word.value),
        );
        const prompt = textInput(q?.prompt ?? 'Listen and pick the meaning', 'Instruction on screen');
        const meaning = textInput(q ? q.choices[q.correctIndex] : '', 'Meaning or translation');
        const wrong = [0, 1, 2].map((i) => {
          const others = q ? q.choices.filter((_, index) => index !== q.correctIndex) : [];
          return textInput(others[i] ?? '', `Wrong meaning ${i + 1} (optional)`);
        });
        const wordRow = el('div', 'tk-st-row');
        wordRow.append(word, preview);
        fields.append(
          field('Word or phrase (spoken aloud)', wordRow),
          field('Instruction', prompt),
          field('Correct meaning / translation', meaning),
          field(
            'Wrong choices',
            el('div', 'tk-st-options'),
            'Leave blank to borrow wrong choices from the kit’s other answers.',
          ),
          field('Example sentence (optional)', explanation),
        );
        fields.querySelector('.tk-st-options')?.append(...wrong);
        build = () => {
          if (word.value.trim() === '' || meaning.value.trim() === '') {
            return 'Enter the word and its meaning.';
          }
          let wrongTexts = wrong.map((input) => input.value.trim()).filter(Boolean);
          if (wrongTexts.length === 0) {
            wrongTexts = this.borrowDistractors(kit, meaning.value.trim(), existing?.id);
          }
          if (wrongTexts.length === 0) {
            return 'Add at least one wrong choice (the kit has no other answers to borrow yet).';
          }
          return {
            id: existing?.id ?? this.newQuestionId(kit),
            kind: QuestionKind.Listening,
            speak: word.value.trim(),
            prompt: prompt.value.trim() || 'Listen and pick the meaning',
            choices: [meaning.value.trim(), ...wrongTexts],
            correctIndex: 0,
            explanation: explanation.value.trim() || undefined,
          };
        };
      } else {
        const q = existing && existing.kind === QuestionKind.FillBlank ? existing : null;
        const prompt = el('textarea', 'tk-st-input');
        prompt.rows = 2;
        prompt.value = q?.prompt ?? '';
        prompt.placeholder = 'The plural of “child” is ___.';
        const answers = textInput(q?.answers.join('; ') ?? '', 'children');
        fields.append(
          field('Sentence with a blank', prompt, 'Write ___ where the word goes.'),
          field('Exact target word', answers, 'Separate accepted spellings with “;”. Capitals do not matter.'),
          field('Explanation (optional)', explanation),
        );
        build = () => {
          const accepted = answers.value
            .split(';')
            .map((answer) => answer.trim())
            .filter(Boolean);
          if (prompt.value.trim() === '' || accepted.length === 0) {
            return 'Enter the sentence and the target word.';
          }
          return {
            id: existing?.id ?? this.newQuestionId(kit),
            kind: QuestionKind.FillBlank,
            prompt: prompt.value.trim(),
            answers: accepted,
            explanation: explanation.value.trim() || undefined,
          };
        };
      }
    };
    drawFields();

    actions.append(
      button('Save question', 'tk-st-btn tk-st-btn--go', () => {
        const result = build();
        if (typeof result === 'string') {
          this.say(result, true);
          return;
        }
        const questions = existing
          ? kit.questions.map((question) => (question.id === existing.id ? result : question))
          : [...kit.questions, result];
        this.library.saveCustom({ ...kit, questions });
        this.editing = null;
        this.say('Question saved.');
        this.render();
      }),
      button('Cancel', 'tk-st-btn tk-st-btn--ghost', () => {
        this.editing = null;
        this.say('');
        this.render();
      }),
    );
    card.append(field('Type', typePicker), fields, actions);
    return card;
  }

  private newQuestionId(kit: Kit): string {
    return `${kit.id}-q${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  }

  private borrowDistractors(kit: Kit, correct: string, skipId?: string): string[] {
    const pool = kit.questions
      .filter((question) => question.id !== skipId && isChoiceQuestion(question))
      .map((question) => getCorrectAnswerText(question))
      .filter((text) => text.toLowerCase() !== correct.toLowerCase());
    return [...new Set(pool)].sort(() => Math.random() - 0.5).slice(0, 3);
  }

  // --- Import / export ---------------------------------------------------------

  private renderImport(): HTMLElement {
    const card = el('div', 'tk-st-card');
    card.append(el('h3', 'tk-st-h3', 'Import questions'));
    const text = el('textarea', 'tk-st-input tk-st-mono');
    text.rows = 6;
    text.placeholder = 'Paste JSON, CSV, or plain lines:\ngo - went | Past simple of go\nbuy - bought | Past simple of buy';

    const file = el('input');
    file.type = 'file';
    file.accept = '.csv,.tsv,.txt,.json,text/*,application/json';
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (chosen) {
        text.value = await chosen.text();
        nameField.value = nameField.value || chosen.name.replace(/\.[^.]+$/, '');
      }
    });
    const nameField = textInput('', 'Name for the new kit');

    const run = (intoSelected: boolean): void => {
      const target = this.getKit();
      const result = parseKitText(text.value, nameField.value.trim() || 'Imported kit');
      if (result.kit === null) {
        this.say(result.error ?? 'Nothing to import.', true);
        return;
      }
      const warn = result.warnings.length > 0 ? ` (${result.warnings.length} skipped)` : '';
      if (intoSelected && target !== null && !target.builtIn) {
        const added = result.kit.questions.map((question, i) => ({
          ...question,
          id: `${this.newQuestionId(target)}-${i}`,
        }));
        this.library.saveCustom({ ...target, questions: [...target.questions, ...added] });
        this.say(`Added ${added.length} questions${warn}.`);
      } else {
        this.library.saveCustom(result.kit);
        this.selectedId = result.kit.id;
        this.say(`Imported “${result.kit.name}” with ${result.kit.questions.length} questions${warn}.`);
      }
      this.importOpen = false;
      this.render();
    };

    const kit = this.getKit();
    const actions = el('div', 'tk-st-row');
    actions.append(
      button('Import as new kit', 'tk-st-btn tk-st-btn--go', () => run(false)),
      ...(kit !== null && !kit.builtIn
        ? [button(`Add to “${kit.name}”`, 'tk-st-btn', () => run(true))]
        : []),
      button('Download CSV template', 'tk-st-btn tk-st-btn--ghost', () =>
        this.download('kit-template.csv', CSV_TEMPLATE, 'text/csv'),
      ),
    );
    card.append(
      field('Paste text or choose a file', text),
      field('', file),
      field('New kit name', nameField),
      actions,
    );
    return card;
  }

  private downloadKit(kit: Kit): void {
    this.download(`${slug(kit.name)}.json`, exportKit(kit), 'application/json');
  }

  private download(name: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = el('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private duplicateKit(kit: Kit): void {
    const id = `custom-${slug(kit.name)}-${Date.now().toString(36)}`;
    const copy: Kit = {
      ...kit,
      id,
      name: `${kit.name} (copy)`,
      builtIn: false,
      questions: kit.questions.map((question, i) => ({ ...question, id: `${id}-q${i + 1}` })),
    };
    this.library.saveCustom(copy);
    this.selectedId = id;
    this.say(`Duplicated as “${copy.name}”.`);
    this.render();
  }

  // --- Tab 2: flashcards -------------------------------------------------------

  private renderFlashcards(): void {
    const wrap = el('div', 'tk-st-center');
    const picker = el('select', 'tk-st-input tk-st-kitpick');
    this.library.getAll().forEach((kit) => {
      const option = el('option', undefined, `${kit.level} · ${kit.name} (${kit.questions.length})`);
      option.value = kit.id;
      option.selected = kit.id === this.selectedId;
      picker.append(option);
    });
    picker.addEventListener('change', () => {
      this.selectedId = picker.value;
      this.render();
    });

    const kit = this.getKit();
    this.viewer = new FlashcardViewer(kit ? cardsFromKit(kit) : []);
    wrap.append(
      field('Warm up with this kit', picker),
      this.viewer.element,
      el('p', 'tk-st-note', 'Click the card to flip it. ← → change cards, the speaker reads the word aloud.'),
    );
    this.body.append(wrap);
    this.viewer.focus();
  }

  // --- Tab 3: classroom rules --------------------------------------------------

  private renderSettings(): void {
    const settings = loadStudioSettings();
    const card = el('div', 'tk-st-card tk-st-settings');
    card.append(
      el('h2', 'tk-st-h2', 'Classroom & balance rules'),
      el(
        'p',
        'tk-st-note',
        'Saved on this device and applied automatically to every live game you host, including “Launch Live Game”.',
      ),
    );
    const save = (patch: Partial<StudioSettings>): void => {
      Object.assign(settings, patch);
      saveStudioSettings(settings);
      this.say('Rules saved ✓');
    };
    const number = (
      value: number,
      min: number,
      max: number,
      onChange: (value: number) => void,
    ): HTMLInputElement => {
      const input = el('input', 'tk-st-input tk-st-number');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      input.addEventListener('change', () => {
        const parsed = Math.min(max, Math.max(min, Math.round(Number(input.value) || 0)));
        input.value = String(parsed);
        onChange(parsed);
      });
      return input;
    };

    card.append(
      field(
        'Base starting HP',
        segmented<number>(
          HP_OPTIONS.map((hp) => [hp, `${hp} HP`]),
          settings.startingHp,
          (startingHp) => save({ startingHp }),
        ),
        'Hits each tank can take before it is destroyed.',
      ),
      field(
        'Enemy speed',
        segmented<EnemySpeed>(
          [
            ['slow', 'Slow'],
            ['normal', 'Normal'],
            ['fast', 'Fast'],
          ],
          settings.enemySpeed,
          (enemySpeed) => save({ enemySpeed }),
        ),
      ),
      field(
        'Wave grace period (seconds)',
        number(settings.waveGraceSeconds, 0, 30, (waveGraceSeconds) => save({ waveGraceSeconds })),
        'Rest time between enemy waves.',
      ),
      field(
        'Starting ammo (shells)',
        number(settings.startShells, 0, 99, (startShells) => save({ startShells })),
      ),
      field(
        'Starting cash ($)',
        number(settings.startCash, 0, 9999, (startCash) => save({ startCash })),
      ),
      field(
        'Reward multiplier per correct answer',
        segmented<number>(
          REWARD_MULTIPLIER_OPTIONS.map((value) => [value, `${value}×`]),
          settings.rewardMultiplier,
          (rewardMultiplier) => save({ rewardMultiplier }),
        ),
      ),
      field(
        'Movement costs fuel',
        segmented<boolean>(
          [
            [true, 'On'],
            [false, 'Off'],
          ],
          settings.movementCostsFuel,
          (movementCostsFuel) => save({ movementCostsFuel }),
        ),
      ),
      button('Reset to defaults', 'tk-st-btn tk-st-btn--ghost', () => {
        saveStudioSettings({ ...DEFAULT_STUDIO_SETTINGS });
        this.say('Rules reset.');
        this.render();
      }),
    );
    this.body.append(card);
  }
}
