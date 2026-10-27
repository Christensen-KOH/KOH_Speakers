import { Subject } from '../core/Subject';
import {
  CSV_TEMPLATE,
  exportKit,
  importKit,
  Kit,
  KitLibrary,
} from '../kits';

import './styles/kit-manager.css';

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

function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fileSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Teacher screen: pick the active kit, import a kit from pasted text or a
 * file (CSV/TSV/JSON), export any kit as JSON and delete custom kits.
 */
export class KitManagerPanel {
  public readonly backRequested = new Subject<void>();
  private readonly library: KitLibrary;
  private readonly root = el('div', 'tk-km');
  private readonly list = el('div', 'tk-km-list');
  private readonly nameInput = el('input', 'tk-km-field');
  private readonly textInput = el('textarea', 'tk-km-field');
  private readonly message = el('div', 'tk-km-message');
  private readonly unsubscribe: () => void;

  constructor(container: HTMLElement, library: KitLibrary) {
    this.library = library;

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'English kits');

    const panel = el('div', 'tk-km-panel tk-glass');

    const header = el('div', 'tk-km-header');
    const back = el('button', 'tk-btn tk-btn--ghost', '← Back');
    back.type = 'button';
    back.addEventListener('click', () => this.backRequested.notify(null));
    header.append(el('h1', 'tk-km-title', 'English Kits'), back);

    const body = el('div', 'tk-km-body');

    const kitsSection = el('section', 'tk-km-section');
    kitsSection.append(el('h2', undefined, 'Choose the kit for your next game'));
    this.list.setAttribute('role', 'radiogroup');
    kitsSection.append(this.list);

    body.append(kitsSection, this.buildImportSection());
    panel.append(header, body);
    this.root.append(panel);

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.backRequested.notify(null);
      }
    });

    container.append(this.root);

    this.unsubscribe = library.changed.addListener(() => this.renderList());
    this.renderList();

    const active = this.list.querySelector<HTMLInputElement>('input:checked');
    active?.focus();
  }

  public destroy(): void {
    this.unsubscribe();
    this.root.remove();
  }

  private buildImportSection(): HTMLElement {
    const section = el('section', 'tk-km-section');
    section.append(el('h2', undefined, 'Create or import a kit'));

    const form = el('form', 'tk-km-import');

    const nameLabel = el('label', undefined, 'Kit name');
    nameLabel.htmlFor = 'tk-km-name';
    this.nameInput.id = 'tk-km-name';
    this.nameInput.placeholder = 'e.g. Unit 4 – Food vocabulary';

    const textLabel = el(
      'label',
      undefined,
      'Paste CSV, a spreadsheet selection, or exported JSON',
    );
    textLabel.htmlFor = 'tk-km-text';
    this.textInput.id = 'tk-km-text';
    this.textInput.spellcheck = false;
    this.textInput.placeholder = CSV_TEMPLATE;

    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.tsv,.txt,.json,text/csv,application/json';
    fileInput.className = 'tk-sr-only';
    fileInput.addEventListener('change', () => this.readFile(fileInput));

    const pickFile = el('button', 'tk-btn tk-btn--ghost tk-btn--small', 'Open file…');
    pickFile.type = 'button';
    pickFile.addEventListener('click', () => fileInput.click());

    const template = el('button', 'tk-btn tk-btn--ghost tk-btn--small', 'Download CSV template');
    template.type = 'button';
    template.addEventListener('click', () =>
      download('tankkit-template.csv', CSV_TEMPLATE, 'text/csv'),
    );

    const submit = el('button', 'tk-btn', 'Import kit');
    submit.type = 'submit';

    const tools = el('div', 'tk-km-row');
    tools.append(submit, pickFile, template, fileInput);

    const help = el('div', 'tk-km-help');
    help.append(
      'Columns: ',
      el('code', undefined, 'type, prompt, answer, wrong1, wrong2, wrong3, speak, explanation'),
      '. Type is choice, listen or fill. Leave the wrong answers empty for a ' +
        'typed answer; separate accepted answers with ',
      el('code', undefined, '|'),
      '. Without a header row, columns are prompt, answer, wrong answers.',
    );

    form.append(
      nameLabel,
      this.nameInput,
      textLabel,
      this.textInput,
      tools,
      this.message,
      help,
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.importText(this.textInput.value);
    });

    section.append(form);
    return section;
  }

  private renderList(): void {
    const activeId = this.library.getActive().id;
    this.list.replaceChildren(
      ...this.library.getAll().map((kit) => this.renderKit(kit, kit.id === activeId)),
    );
  }

  private renderKit(kit: Kit, isActive: boolean): HTMLElement {
    const item = el('label', 'tk-km-kit');
    item.classList.toggle('is-active', isActive);

    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'tk-active-kit';
    radio.checked = isActive;
    radio.addEventListener('change', () => this.library.setActive(kit.id));

    const meta = el('div', 'tk-km-kit-meta');
    meta.append(
      el('span', 'tk-km-level', kit.level),
      `${kit.questions.length} questions · ${kit.builtIn ? 'Built-in' : 'Custom'}`,
    );
    if (kit.description) {
      meta.append(` · ${kit.description}`);
    }

    const actions = el('div', 'tk-km-actions');
    const exportButton = el('button', 'tk-btn tk-btn--ghost tk-btn--small', 'Export JSON');
    exportButton.type = 'button';
    exportButton.addEventListener('click', (event) => {
      event.preventDefault();
      download(`${fileSlug(kit.name) || 'kit'}.json`, exportKit(kit), 'application/json');
    });
    actions.append(exportButton);

    if (!kit.builtIn) {
      const remove = el('button', 'tk-btn tk-btn--danger tk-btn--small', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.confirm(`Delete "${kit.name}"? This can't be undone.`)) {
          this.library.deleteCustom(kit.id);
        }
      });
      actions.append(remove);
    }

    item.append(radio, el('span', 'tk-km-kit-name', kit.name), meta, actions);
    return item;
  }

  private readFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    file.text().then((text) => {
      this.textInput.value = text;
      if (this.nameInput.value.trim() === '') {
        this.nameInput.value = file.name.replace(/\.[^.]+$/, '');
      }
      input.value = '';
    });
  }

  private importText(text: string): void {
    const fallbackName = this.nameInput.value.trim() || 'My Kit';
    const { kit, warnings, error } = importKit(text, fallbackName);

    this.message.className = 'tk-km-message';
    this.message.replaceChildren();

    if (kit === null) {
      this.message.classList.add('is-error');
      this.message.append(error ?? 'Import failed.');
    } else {
      // A typed name wins over a name stored in JSON.
      if (this.nameInput.value.trim() !== '') {
        kit.name = this.nameInput.value.trim();
      }
      this.library.saveCustom(kit);
      this.library.setActive(kit.id);
      this.list
        .querySelector('.tk-km-kit.is-active')
        ?.scrollIntoView({ block: 'nearest' });
      this.message.classList.add('is-success');
      this.message.append(
        `Imported "${kit.name}" with ${kit.questions.length} questions. It is now the active kit.`,
      );
      this.textInput.value = '';
      this.nameInput.value = '';
    }

    if (warnings.length > 0) {
      const list = el('ul');
      warnings.slice(0, 8).forEach((warning) => list.append(el('li', undefined, warning)));
      if (warnings.length > 8) {
        list.append(el('li', undefined, `…and ${warnings.length - 8} more.`));
      }
      this.message.append(list);
    }
  }
}
