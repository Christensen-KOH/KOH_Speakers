import { createQrCanvas, joinUrl } from './qr';
import { Subject } from '../core/Subject';
import { exportKit, KitLibrary } from '../kits';
import {
  accuracyOf,
  ConnectionStatus,
  LIVE_DURATION_OPTIONS,
  LIVE_INFO_PATH,
  LiveMistakeSummary,
  LivePlayerSummary,
  LiveRewardLevel,
  LiveRoomState,
  LiveSession,
  LiveSettings,
} from '../live';

import { PLAYER_CSS_COLORS } from '../tank/TankColorFactory';

import { loadStudioSettings } from '../studio/StudioSettings';

import { Speech } from './Speech';

import './styles/kit-manager.css';
import './styles/host.css';
import './styles/report.css';
import './styles/live.css';

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

function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Spreadsheet apps execute cells that start with = + - @; neutralise them.
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  idle: '',
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
};

/**
 * Teacher's live-class dashboard: set up a game, show the join code, watch
 * the live leaderboard, end the game and review results.
 */
export class LiveHostPanel {
  public readonly exitRequested = new Subject<void>();
  private readonly live: LiveSession;
  private readonly library: KitLibrary;
  private readonly speech = new Speech();
  private readonly root = el('div', 'tk-live');
  private readonly body = el('div', 'tk-live-body');
  private readonly conn = el('span', 'tk-live-conn is-idle');
  private readonly message = el('span', 'tk-km-message');
  private readonly footer = el('div', 'tk-host-footer');
  private readonly unsubscribers: (() => void)[] = [];
  private settings: LiveSettings = {
    durationMinutes: 5,
    classGoal: 0,
    rewardLevel: 'balanced',
    movementCostsFuel: true,
    startShells: 10,
    startCash: 0,
    rewardMultiplier: 1,
  };
  private timerEl: HTMLElement = null;
  private timerInterval: number = null;
  private lanAddresses: string[] = [];
  private lastStatus: string = null;
  // While playing, the dashboard shrinks to a corner card so the projector
  // shows the battlefield; "Details" expands it.
  private compact = true;
  private slotOf: (playerId: string) => number | null = () => null;

  constructor(container: HTMLElement, live: LiveSession, library: KitLibrary) {
    this.live = live;
    this.library = library;
    this.applyStudioDefaults();

    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Host a live class');

    const panel = el('div', 'tk-live-panel tk-glass');
    const header = el('div', 'tk-km-header');
    header.append(
      el('h1', 'tk-km-title', 'Live Class'),
      this.conn,
      button('Exit', 'tk-btn tk-btn--ghost', () => this.exitRequested.notify(null)),
    );
    this.message.setAttribute('aria-live', 'polite');
    panel.append(header, this.body, this.footer);
    this.root.append(panel);
    container.append(this.root);

    this.unsubscribers.push(
      live.roomChanged.addListener(() => this.render()),
      live.mistakesChanged.addListener(() => this.render()),
      live.errored.addListener((error) => this.showMessage(error.message, true)),
      live.client.statusChanged.addListener(this.renderConnection),
    );
    this.timerInterval = window.setInterval(this.renderTimer, 250);

    this.fetchLanAddresses();
    this.render();
  }

  /** Which battlefield slot (tank colour) a player has, for the list dots. */
  public setSlotLookup(lookup: (playerId: string) => number | null): void {
    this.slotOf = lookup;
  }

  // Classroom rules saved in the Teacher Studio
  private applyStudioDefaults(includeFuel = true): void {
    const studio = loadStudioSettings();
    if (includeFuel) {
      this.settings.movementCostsFuel = studio.movementCostsFuel;
    }
    this.settings.startShells = studio.startShells;
    this.settings.startCash = studio.startCash;
    this.settings.rewardMultiplier = studio.rewardMultiplier;
  }

  /** Opens the full dashboard (leaderboard, mistakes) over the battlefield. */
  public showDetails(): void {
    this.compact = false;
    this.render();
  }

  public destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    window.clearInterval(this.timerInterval);
    this.speech.cancel();
    this.root.remove();
  }

  private fetchLanAddresses(): void {
    fetch(LIVE_INFO_PATH)
      .then((response) => (response.ok ? response.json() : null))
      .then((info) => {
        if (info && Array.isArray(info.addresses)) {
          this.lanAddresses = info.addresses.filter((a: unknown) => typeof a === 'string');
          this.render();
        }
      })
      .catch(() => undefined);
  }

  private renderConnection = (status: ConnectionStatus): void => {
    this.conn.className = `tk-live-conn is-${status}`;
    this.conn.textContent = CONNECTION_LABELS[status];
  };

  private showMessage(text: string, isError = false): void {
    this.message.className = `tk-km-message ${isError ? 'is-error' : 'is-success'}`;
    this.message.textContent = text;
  }

  private render(): void {
    const room = this.live.getRoom();
    const status = room ? room.status : 'setup';
    if (status !== this.lastStatus) {
      this.message.textContent = '';
      this.lastStatus = status;
    }

    this.body.replaceChildren();
    this.footer.replaceChildren(this.message);
    this.timerEl = null;
    this.root.classList.toggle('is-compact', status === 'playing' && this.compact);

    if (room === null) {
      this.renderSetup();
    } else if (room.status === 'lobby') {
      this.renderLobby(room);
    } else if (room.status === 'playing') {
      this.renderPlaying(room);
    } else {
      this.renderResults(room);
    }
    this.renderTimer();
  }

  // --- Setup ---------------------------------------------------------------

  private renderSetup(): void {
    const stored = this.live.getStoredHost();
    if (stored) {
      const resume = el('div', 'tk-live-code-box');
      resume.append(
        el('span', undefined, `You were hosting game ${stored.code}.`),
        button('Resume it', 'tk-btn', () => this.live.resumeHost(stored)),
      );
      this.body.append(resume);
    }

    const section = el('section', 'tk-host-section');
    section.append(el('h2', undefined, 'New live game'));
    const grid = el('div', 'tk-host-grid');

    const kitField = el('label', 'tk-host-field');
    const select = el('select', 'tk-km-field');
    const active = this.library.getActive();
    this.library.getAll().forEach((kit) => {
      const option = el('option', undefined, `${kit.level} · ${kit.name} (${kit.questions.length})`);
      option.value = kit.id;
      option.selected = kit.id === active.id;
      select.append(option);
    });
    select.addEventListener('change', () => this.library.setActive(select.value));
    kitField.append(
      el('span', undefined, 'English kit'),
      select,
      el('small', undefined, 'Students receive this kit when they join, custom kits included.'),
    );

    const durationField = el('div', 'tk-host-field');
    durationField.append(
      el('span', undefined, 'Game length'),
      segmented(
        'tk-live-duration',
        LIVE_DURATION_OPTIONS.map((minutes) => [minutes, `${minutes} min`]),
        this.settings.durationMinutes,
        (value) => (this.settings.durationMinutes = value),
      ),
    );

    const goalField = el('label', 'tk-host-field');
    const goal = el('input', 'tk-km-field');
    goal.type = 'number';
    goal.min = '0';
    goal.step = '100';
    goal.placeholder = 'e.g. 5000';
    goal.value = this.settings.classGoal > 0 ? String(this.settings.classGoal) : '';
    goal.addEventListener('input', () => {
      this.settings.classGoal = Math.max(0, Math.round(Number(goal.value) || 0));
    });
    goalField.append(
      el('span', undefined, 'Class cash goal (optional)'),
      goal,
      el('small', undefined, 'Everyone works together toward one total.'),
    );

    const rewardField = el('div', 'tk-host-field');
    rewardField.append(
      el('span', undefined, 'Reward per question'),
      segmented<LiveRewardLevel>(
        'tk-live-reward',
        [
          ['low', 'Low'],
          ['balanced', 'Balanced'],
          ['high', 'High'],
        ],
        this.settings.rewardLevel,
        (value) => (this.settings.rewardLevel = value),
      ),
    );

    const fuelField = el('div', 'tk-host-field');
    fuelField.append(
      el('span', undefined, 'Movement costs fuel'),
      segmented(
        'tk-live-fuel',
        [
          ['on', 'On'],
          ['off', 'Off'],
        ],
        this.settings.movementCostsFuel ? 'on' : 'off',
        (value) => (this.settings.movementCostsFuel = value === 'on'),
      ),
    );

    grid.append(kitField, durationField, goalField, rewardField, fuelField);
    section.append(grid);
    this.body.append(section);

    const help = el('div', 'tk-host-controls');
    help.append(
      'Everyone shares one battlefield and one base (up to 8 tanks; more students watch and answer). ',
      'This screen runs the battle: show it on the projector and keep it open. ',
      'Students join from laptops, tablets or phones on the same network.',
    );
    this.body.append(help);

    this.footer.append(
      button('Create game ▶', 'tk-btn tk-btn--start', () => {
        // Pick up rules changed in the Teacher Studio since this screen opened
        this.applyStudioDefaults(false);
        const kit = this.library.getActive();
        const exported = JSON.parse(exportKit(kit));
        this.showMessage('Creating game…');
        this.live.createGame(
          { id: kit.id, name: kit.name, level: kit.level, questions: exported.questions },
          { ...this.settings },
        );
      }),
    );
  }

  // --- Lobby ---------------------------------------------------------------

  private renderJoinInfo(room: LiveRoomState): HTMLElement {
    const box = el('div', 'tk-live-code-box');
    const codeBlock = el('div');
    codeBlock.append(el('div', 'tk-live-code-label', 'Join code'), el('div', 'tk-live-code', room.code));

    const urls = el('div', 'tk-live-urls');
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const origins =
      isLocal && this.lanAddresses.length > 0 ? this.lanAddresses : [window.location.origin];
    urls.append(el('span', 'tk-live-code-label', 'Students open'));
    origins.forEach((origin) => {
      urls.append(el('code', undefined, `${origin}${window.location.pathname}?room=${room.code}`));
    });
    if (isLocal && this.lanAddresses.length === 0) {
      urls.append(
        el('small', 'tk-km-help', 'Running locally: online students join on the published game page with this code.'),
      );
    }

    const qr = createQrCanvas(joinUrl(room.code, origins[0]), 220);
    box.append(qr, codeBlock, urls);
    return box;
  }

  private renderLobby(room: LiveRoomState): void {
    this.body.append(this.renderJoinInfo(room));

    const section = el('section', 'tk-report-section');
    section.append(el('h2', undefined, `Players (${room.players.length})`));
    if (room.players.length === 0) {
      section.append(el('div', 'tk-live-empty', 'Waiting for students to join…'));
    } else {
      const roster = el('div', 'tk-live-roster');
      room.players.forEach((player) => roster.append(this.renderChip(player)));
      section.append(roster);
    }
    this.body.append(section);

    const summary = el(
      'span',
      'tk-host-summary',
      `${room.kitName} · ${room.settings.durationMinutes} min` +
        (room.settings.classGoal > 0 ? ` · goal $${room.settings.classGoal}` : ''),
    );
    const start = button('Start game ▶', 'tk-btn tk-btn--start', () => this.live.startGame());
    start.disabled = room.players.length === 0;
    this.footer.append(
      summary,
      button('Cancel game', 'tk-btn tk-btn--ghost', () => this.live.endGame()),
      start,
    );
  }

  private renderChip(player: LivePlayerSummary): HTMLElement {
    const chip = el('span', `tk-live-chip${player.connected ? '' : ' is-offline'}`, player.nickname);
    const kick = button('×', 'tk-live-kick', () => {
      if (window.confirm(`Remove ${player.nickname} from the game?`)) {
        this.live.kick(player.id);
      }
    });
    kick.setAttribute('aria-label', `Remove ${player.nickname}`);
    chip.append(kick);
    return chip;
  }

  // --- Playing -------------------------------------------------------------

  private renderStatusBar(room: LiveRoomState): HTMLElement {
    const bar = el('div', 'tk-live-status');
    this.timerEl = el('span', 'tk-live-timer');
    bar.append(el('span', 'tk-live-code', room.code), this.timerEl);

    if (room.settings.classGoal > 0) {
      const goal = el('div', 'tk-live-goal');
      const progress = Math.min(1, room.classCash / room.settings.classGoal);
      goal.append(
        el(
          'span',
          undefined,
          `Class goal: $${room.classCash} / $${room.settings.classGoal}` +
            (progress >= 1 ? ' 🎉 reached!' : ''),
        ),
      );
      const track = el('div', 'tk-live-goal-bar');
      const fill = el('div');
      fill.style.transform = `scaleX(${progress})`;
      track.append(fill);
      goal.append(track);
      bar.append(goal);
    } else {
      bar.append(el('span', 'tk-host-summary', `Class total: $${room.classCash}`));
    }
    return bar;
  }

  private renderLeaderboard(room: LiveRoomState, withKick: boolean): HTMLElement {
    if (room.players.length === 0) {
      return el('div', 'tk-live-empty', 'No players.');
    }
    const table = el('table', 'tk-live-table');
    const head = el('tr');
    ['#', 'Player', 'Cash', 'Accuracy', 'Answered', 'Best 🔥', 'Stage', ''].forEach((label, index) => {
      head.append(el('th', index >= 2 && index <= 6 ? 'is-num' : undefined, label));
    });
    table.append(head);

    room.players.forEach((player, index) => {
      const row = el('tr');
      const { stats } = player;
      row.append(
        el('td', 'tk-live-rank', String(index + 1)),
        el('td', `tk-live-name${player.connected ? '' : ' is-offline'}`, player.nickname),
        el('td', 'is-num tk-live-cash', `$${stats.cashEarned}`),
        el('td', 'is-num', stats.answered > 0 ? `${accuracyOf(stats)}%` : '–'),
        el('td', 'is-num', String(stats.answered)),
        el('td', 'is-num', String(stats.bestStreak)),
        el('td', 'is-num', String(stats.stage)),
      );
      const actions = el('td');
      if (withKick) {
        const kick = button('×', 'tk-live-kick', () => {
          if (window.confirm(`Remove ${player.nickname} from the game?`)) {
            this.live.kick(player.id);
          }
        });
        kick.setAttribute('aria-label', `Remove ${player.nickname}`);
        actions.append(kick);
      }
      row.append(actions);
      table.append(row);
    });
    return table;
  }

  private renderPlaying(room: LiveRoomState): void {
    if (this.compact) {
      this.renderPlayingCompact(room);
      return;
    }
    this.body.append(this.renderStatusBar(room), this.renderLeaderboard(room, true));

    const mistakes = this.live.getMistakes();
    if (mistakes.length > 0) {
      this.body.append(this.renderMistakes(mistakes.slice(0, 5), 'Most missed so far'));
    }

    this.footer.append(
      el('span', 'tk-host-summary', `Late joiners can still use code ${room.code}.`),
      button('Back to battlefield', 'tk-btn tk-btn--ghost', () => {
        this.compact = true;
        this.render();
      }),
      button('End game now', 'tk-btn tk-btn--danger', () => {
        if (window.confirm('End the game for everyone?')) {
          this.live.endGame();
        }
      }),
    );
  }

  private renderPlayingCompact(room: LiveRoomState): void {
    const status = el('div', 'tk-live-mini-status');
    this.timerEl = el('span', 'tk-live-timer');
    status.append(el('span', 'tk-live-mini-code', `Code ${room.code}`), this.timerEl);
    this.body.append(status);

    if (room.settings.classGoal > 0) {
      const progress = Math.min(1, room.classCash / room.settings.classGoal);
      const track = el('div', 'tk-live-goal-bar');
      const fill = el('div');
      fill.style.transform = `scaleX(${progress})`;
      track.append(fill);
      this.body.append(
        el('span', 'tk-host-summary', `Class ${room.classCash} / ${room.settings.classGoal}`),
        track,
      );
    }

    const list = el('ol', 'tk-live-mini-list');
    room.players.slice(0, 10).forEach((player) => {
      const item = el('li');
      const slot = this.slotOf(player.id);
      const dot = el('span', 'tk-live-dot');
      if (slot !== null) {
        dot.style.background = PLAYER_CSS_COLORS[slot % PLAYER_CSS_COLORS.length];
      } else {
        dot.title = 'Watching (battlefield full)';
      }
      item.append(
        dot,
        el('span', `tk-live-name${player.connected ? '' : ' is-offline'}`, player.nickname),
        el('span', 'tk-live-cash', `${player.stats.cashEarned}`),
      );
      list.append(item);
    });
    if (room.players.length > 10) {
      list.append(el('li', 'tk-host-summary', `+${room.players.length - 10} more`));
    }
    this.body.append(list);

    this.footer.append(
      button('Details', 'tk-btn tk-btn--ghost tk-btn--small', () => {
        this.compact = false;
        this.render();
      }),
      button('End', 'tk-btn tk-btn--danger tk-btn--small', () => {
        if (window.confirm('End the game for everyone?')) {
          this.live.endGame();
        }
      }),
    );
  }

  private renderTimer = (): void => {
    if (this.timerEl === null) {
      return;
    }
    const remaining = this.live.getRemainingMs();
    const text = remaining === null ? '' : `⏱ ${formatTime(remaining)}`;
    if (this.timerEl.textContent !== text) {
      this.timerEl.textContent = text;
    }
  };

  // --- Results -------------------------------------------------------------

  private renderResults(room: LiveRoomState): void {
    const players = room.players;
    const answered = players.reduce((sum, p) => sum + p.stats.answered, 0);
    const correct = players.reduce((sum, p) => sum + p.stats.correct, 0);

    if (players.length > 0) {
      const podium = el('div', 'tk-live-podium');
      // Display order 2nd, 1st, 3rd
      [1, 0, 2].forEach((index) => {
        const player = players[index];
        if (!player) {
          return;
        }
        const step = el('div');
        step.append(
          el('span', undefined, ['🥇', '🥈', '🥉'][index]),
          el('strong', undefined, player.nickname),
          el('span', 'tk-live-cash', `$${player.stats.cashEarned}`),
        );
        podium.append(step);
      });
      this.body.append(podium);
    }

    const stats = el('div', 'tk-report-stats');
    const stat = (value: string, label: string): HTMLElement => {
      const tile = el('div', 'tk-report-stat');
      tile.append(el('span', 'tk-report-stat-value', value), el('span', 'tk-report-stat-label', label));
      return tile;
    };
    stats.append(
      stat(String(players.length), 'Players'),
      stat(answered > 0 ? `${Math.round((correct / answered) * 100)}%` : '–', 'Class accuracy'),
      stat(String(answered), 'Questions answered'),
      stat(`$${room.classCash}`, 'Class cash'),
    );
    if (room.settings.classGoal > 0) {
      stats.append(
        stat(room.classCash >= room.settings.classGoal ? 'Reached 🎉' : 'Missed', `Goal $${room.settings.classGoal}`),
      );
    }
    this.body.append(stats, this.renderLeaderboard(room, false));

    const mistakes = this.live.getMistakes();
    this.body.append(
      mistakes.length > 0
        ? this.renderMistakes(mistakes, 'Most missed questions')
        : el('div', 'tk-report-empty', 'No mistakes recorded. Great work, class!'),
    );

    this.footer.append(
      button('Download results (CSV)', 'tk-btn tk-btn--ghost', () => this.downloadCsv(room)),
      button('New game', 'tk-btn tk-btn--start', () => {
        this.live.leave();
        this.render();
      }),
    );
  }

  private renderMistakes(mistakes: LiveMistakeSummary[], title: string): HTMLElement {
    const section = el('section', 'tk-report-section');
    section.append(el('h2', undefined, `🔐 ${title}`));
    const list = el('ul', 'tk-live-mistakes');
    mistakes.forEach((mistake) => {
      const item = el('li', 'tk-vault-item');
      const say = button('🔊', 'tk-qm-audio', () => this.speech.speak(mistake.correctText, 0.85));
      say.setAttribute('aria-label', `Hear "${mistake.correctText}"`);

      const answers = el('div', 'tk-vault-answers');
      const right = el('span');
      right.append('Answer: ', el('span', 'tk-vault-correct', mistake.correctText));
      answers.append(right);
      if (mistake.wrongAnswers.length > 0) {
        const wrong = el('span');
        wrong.append(
          'Common wrong answers: ',
          el(
            'span',
            'tk-vault-given',
            mistake.wrongAnswers.map((answer) => `${answer.text} (${answer.count})`).join(', '),
          ),
        );
        answers.append(wrong);
      }

      const badges = el('div', 'tk-vault-badges');
      badges.append(el('span', 'tk-vault-badge', `missed ×${mistake.misses}`));

      item.append(say, el('div', 'tk-vault-prompt', mistake.prompt), badges, answers);
      list.append(item);
    });
    section.append(list);
    return section;
  }

  private downloadCsv(room: LiveRoomState): void {
    const rows = [
      ['Rank', 'Nickname', 'Cash earned', 'Accuracy %', 'Correct', 'Answered', 'Best streak', 'Stage'],
      ...room.players.map((player, index) => [
        index + 1,
        player.nickname,
        player.stats.cashEarned,
        accuracyOf(player.stats),
        player.stats.correct,
        player.stats.answered,
        player.stats.bestStreak,
        player.stats.stage,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = el('a');
    link.href = url;
    link.download = `tankkit-live-${room.code}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    this.showMessage('Results downloaded.');
  }
}
