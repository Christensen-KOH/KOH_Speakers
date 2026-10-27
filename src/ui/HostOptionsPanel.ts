import { Subject } from '../core/Subject';
import { RewardLevel } from '../gimkit-economy/EconomySettings';
import { KitLibrary } from '../kits';
import {
  BLITZ_MINUTE_OPTIONS,
  getModeInfo,
  MATCH_MODES,
  MatchMode,
  MatchSettings,
} from '../match';

import './styles/kit-manager.css';
import './styles/host.css';

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

function kbd(text: string): HTMLElement {
  return el('kbd', 'tk-kbd', text);
}

/** Segmented radio control; returns the wrapper. */
function segmented<T extends string | number>(
  name: string,
  options: [T, string][],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const group = el('div', 'tk-segmented');
  group.setAttribute('role', 'radiogroup');
  options.forEach(([optionValue, label]) => {
    const wrapper = el('label');
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.checked = optionValue === value;
    input.addEventListener('change', () => onChange(optionValue));
    wrapper.append(input, el('span', undefined, label));
    group.append(wrapper);
  });
  return group;
}

/**
 * Gimkit-style "Host / Game Options": mode, kit and balance before a match.
 * Emits the chosen settings on Start.
 */
export class HostOptionsPanel {
  public readonly startRequested = new Subject<MatchSettings>();
  public readonly backRequested = new Subject<void>();
  private readonly root = el('div', 'tk-host');
  private readonly library: KitLibrary;
  private settings: MatchSettings;
  private readonly sharedCashField = el('div', 'tk-host-field');
  private readonly blitzField = el('div', 'tk-host-field');
  private readonly controls = el('div', 'tk-host-controls');
  private readonly summary = el('span', 'tk-host-summary');

  constructor(container: HTMLElement, library: KitLibrary, settings: MatchSettings) {
    this.library = library;
    this.settings = { ...settings };

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Game options');

    const panel = el('div', 'tk-host-panel tk-glass');

    const header = el('div', 'tk-km-header');
    const back = el('button', 'tk-btn tk-btn--ghost', '← Back');
    back.type = 'button';
    back.addEventListener('click', () => this.backRequested.notify(null));
    header.append(el('h1', 'tk-km-title', 'Game Options'), back);

    const body = el('div', 'tk-host-body');
    body.append(this.buildModes(), this.buildKitAndBalance(), this.controls);

    const footer = el('div', 'tk-host-footer');
    const start = el('button', 'tk-btn tk-btn--start', 'Start ▶');
    start.type = 'button';
    start.addEventListener('click', this.start);
    footer.append(this.summary, start);

    panel.append(header, body, footer);
    this.root.append(panel);

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.backRequested.notify(null);
      } else if (
        event.key === 'Enter' &&
        !event.repeat &&
        (event.target as HTMLElement).tagName !== 'BUTTON'
      ) {
        event.preventDefault();
        this.start();
      }
    });

    container.append(this.root);
    this.refresh();
    // Focus the chosen mode, not Start: a held Enter from the main menu
    // would otherwise start the match straight away.
    this.root.querySelector<HTMLInputElement>('input[name="tk-host-mode"]:checked')?.focus();
  }

  public destroy(): void {
    this.root.remove();
  }

  private start = (): void => {
    this.startRequested.notify({ ...this.settings });
  };

  private buildModes(): HTMLElement {
    const section = el('section', 'tk-host-section');
    section.append(el('h2', undefined, 'Game mode'));

    const list = el('div', 'tk-host-modes');
    list.setAttribute('role', 'radiogroup');
    MATCH_MODES.forEach((info) => {
      const card = el('label', 'tk-host-mode');
      const input = el('input');
      input.type = 'radio';
      input.name = 'tk-host-mode';
      input.checked = info.mode === this.settings.mode;
      input.addEventListener('change', () => {
        this.settings.mode = info.mode;
        this.refresh();
      });

      const title = el('span', 'tk-host-mode-title');
      title.append(
        el('span', 'tk-host-mode-icon', info.icon),
        info.name,
        el('span', 'tk-host-players', info.players === 1 ? '1P' : '2P'),
      );
      card.append(input, title, el('span', 'tk-host-mode-desc', info.description));
      list.append(card);
    });

    section.append(list);
    return section;
  }

  private buildKitAndBalance(): HTMLElement {
    const section = el('section', 'tk-host-section');
    section.append(el('h2', undefined, 'Kit & balance'));

    const grid = el('div', 'tk-host-grid');

    // Kit
    const kitField = el('label', 'tk-host-field');
    const select = el('select', 'tk-km-field');
    const active = this.library.getActive();
    this.library.getAll().forEach((kit) => {
      const option = el(
        'option',
        undefined,
        `${kit.level} · ${kit.name} (${kit.questions.length})`,
      );
      option.value = kit.id;
      option.selected = kit.id === active.id;
      select.append(option);
    });
    select.addEventListener('change', () => this.library.setActive(select.value));
    kitField.append(
      el('span', undefined, 'English kit'),
      select,
      el('small', undefined, 'Create or import kits in MODES → ENGLISH KITS.'),
    );

    // Reward per question
    const rewardField = el('div', 'tk-host-field');
    rewardField.append(
      el('span', undefined, 'Reward per question'),
      segmented(
        'tk-host-reward',
        [
          [RewardLevel.Low, 'Low'],
          [RewardLevel.Balanced, 'Balanced'],
          [RewardLevel.High, 'High'],
        ],
        this.settings.rewardLevel,
        (value) => {
          this.settings.rewardLevel = value;
          this.refresh();
        },
      ),
      el('small', undefined, 'Shells and fuel paid for each correct answer.'),
    );

    // Movement costs fuel
    const fuelField = el('div', 'tk-host-field');
    fuelField.append(
      el('span', undefined, 'Movement costs fuel'),
      segmented(
        'tk-host-fuel',
        [
          ['on', 'On'],
          ['off', 'Off'],
        ],
        this.settings.movementCostsFuel ? 'on' : 'off',
        (value) => {
          this.settings.movementCostsFuel = value === 'on';
          this.refresh();
        },
      ),
      el('small', undefined, 'Off: driving is free; only shooting and upgrades need answers.'),
    );

    // Shared cash (co-op)
    this.sharedCashField.append(
      el('span', undefined, 'Co-op cash'),
      segmented(
        'tk-host-shared',
        [
          ['shared', 'Shared'],
          ['separate', 'Separate'],
        ],
        this.settings.sharedCash ? 'shared' : 'separate',
        (value) => {
          this.settings.sharedCash = value === 'shared';
          this.refresh();
        },
      ),
      el('small', undefined, 'Shared: both players spend from one wallet.'),
    );

    // Blitz length
    this.blitzField.append(
      el('span', undefined, 'Blitz length'),
      segmented(
        'tk-host-blitz',
        BLITZ_MINUTE_OPTIONS.map((minutes) => [minutes, `${minutes} min`]),
        this.settings.blitzMinutes,
        (value) => {
          this.settings.blitzMinutes = value;
          this.refresh();
        },
      ),
    );

    grid.append(kitField, rewardField, fuelField, this.sharedCashField, this.blitzField);
    section.append(grid);
    return section;
  }

  private refresh(): void {
    const info = getModeInfo(this.settings.mode);
    this.sharedCashField.hidden = this.settings.mode !== MatchMode.Coop;
    this.blitzField.hidden = this.settings.mode !== MatchMode.TycoonBlitz;

    this.summary.textContent =
      info.players === 2
        ? `${info.name} · 2 players on one keyboard`
        : `${info.name} · 1 player`;

    this.controls.replaceChildren(el('strong', undefined, 'Controls: '));
    const line = (label: string, ...keys: (string | HTMLElement)[]): HTMLElement => {
      const row = el('div');
      row.append(label, ...keys);
      return row;
    };
    // Default keyboard schemes (players can change them on the controls
    // screen before the first level).
    if (info.players === 2) {
      this.controls.append(
        line(
          'Player 1: ',
          'move ', kbd('W'), kbd('A'), kbd('S'), kbd('D'), ' · fire ', kbd('F'),
          ' · questions ', kbd('Q'), ' · shop ', kbd('B'),
        ),
        line(
          'Player 2: ',
          'move ', kbd('←↑↓→'), ' · fire ', kbd('K'),
          ' · questions ', kbd('P'), ' · shop ', kbd('M'),
        ),
      );
    } else {
      this.controls.append(
        line(
          'move ', kbd('←↑↓→'), ' · fire ', kbd('Z'), ' · questions ', kbd('Q'),
          ' · shop ', kbd('B'), ' · pause ', kbd('Enter'),
        ),
      );
    }
    this.controls.append(
      line('Questions: answer with ', kbd('1'), '–', kbd('4'), ' or type, then ', kbd('Enter'), '.'),
    );
  }
}
