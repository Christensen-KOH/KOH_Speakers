import { Subject } from '../core/Subject';
import { Rotation } from '../game/Rotation';
import type { Session } from '../game/Session';
import { InputControl, InputManager } from '../input';
import * as config from '../config';

import { OverlayGate } from './OverlayGate';
import { QuestionController } from './QuestionController';
import { TOUCH_UI_CLASS } from './touchUi';

import './styles/controls.css';

export { isTouchUi } from './touchUi';

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_CONTROLS: Record<Direction, InputControl> = {
  up: InputControl.Up,
  down: InputControl.Down,
  left: InputControl.Left,
  right: InputControl.Right,
};

// WASD alongside the arrows (single player only: in local 2-player games
// WASD belongs to the other player's binding).
const WASD: Record<string, Direction> = { w: 'up', a: 'left', s: 'down', d: 'right' };

// Tap fires at once (PrimaryAction); holding keeps firing (SecondaryAction).
const FIRE_CONTROLS = [InputControl.PrimaryAction, InputControl.SecondaryAction];

// Thumb travel before the joystick counts as a direction (px).
const JOYSTICK_DEAD_ZONE = 14;
const JOYSTICK_RADIUS = 48;

const ROTATION_DIRECTIONS: Record<Rotation, Direction> = {
  [Rotation.Up]: 'up',
  [Rotation.Right]: 'right',
  [Rotation.Down]: 'down',
  [Rotation.Left]: 'left',
};

// Held left-click counts as a drag (drive) after this much travel (px).
const MOUSE_DRAG_DISTANCE = 8;
// The tank is "there" once the cursor is this close on both axes (field px).
const MOUSE_ARRIVE_DISTANCE = 12;

// Full-screen DOM panels bring their own buttons.
// The host's compact card counts too: the teacher's screen needs no pad.
const PANEL_SELECTOR = '.tk-live:not(.is-compact), .tk-km, .tk-host, .tk-report';

export interface FieldPoint {
  x: number;
  y: number;
}

export type ControlMode = 'desktop' | 'touch';

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

function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return (
    node !== null &&
    (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT')
  );
}

/**
 * Picks controls for the device in use and switches when the player does:
 *
 * - Desktop: no on-screen UI. WASD/arrows move, Space fires, left-click on
 *   the playfield turns toward the cursor and fires, holding right-click (or
 *   left-click + drag) drives toward the cursor, middle-click / side buttons
 *   (or Tab/Q) toggle the Command Hub.
 * - Touch: a floating joystick wherever the thumb lands on the left half,
 *   tap/hold the right half to fire. The Hub button lives in the HUD.
 *
 * Movement and fire go through the input manager as virtual keys, so menus,
 * rebinding and gameplay need no special cases. Aimed shots are published
 * on `aimFire` for the active scene.
 */
export class AdaptiveControls {
  // Left-click / aimed shot at a playfield point (field coordinates).
  public readonly aimFire = new Subject<FieldPoint>();
  public readonly modeChanged = new Subject<ControlMode>();
  // Middle-click or a mouse side button: open/close the Command Hub.
  public readonly hubToggleRequested = new Subject<void>();

  private readonly input: InputManager;
  private readonly gate: OverlayGate;
  private readonly questions: QuestionController;
  private readonly session: Session;
  private readonly stage: HTMLElement;
  private readonly uiLayer: HTMLElement;
  private mode: ControlMode;

  private readonly zones = el('div', 'tk-tz');
  private readonly leftZone = el('div', 'tk-tz-half');
  private readonly rightZone = el('div', 'tk-tz-half');
  private readonly joystick = el('div', 'tk-joystick');
  private readonly knob = el('div', 'tk-joystick-knob');

  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private direction: Direction | null = null;
  private readonly firePointers = new Set<number>();
  private readonly heldKeys = new Map<string, InputControl[]>();

  // Mouse play: cursor on the battlefield and the buttons that drive.
  private mouse: FieldPoint | null = null;
  private mouseMoved = false;
  private rightHeld = false;
  private leftAnchor: { x: number; y: number } | null = null;
  private leftDragging = false;
  private mouseDirection: Direction | null = null;

  constructor(
    input: InputManager,
    gate: OverlayGate,
    questions: QuestionController,
    session: Session,
    stage: HTMLElement,
    uiLayer: HTMLElement,
  ) {
    this.input = input;
    this.gate = gate;
    this.questions = questions;
    this.session = session;
    this.stage = stage;
    this.uiLayer = uiLayer;

    // --- Touch layer ---
    this.zones.setAttribute('aria-hidden', 'true');
    this.joystick.append(this.knob);
    this.joystick.hidden = true;
    this.zones.append(this.leftZone, this.rightZone, this.joystick);

    this.leftZone.addEventListener('pointerdown', this.handleStickDown);
    this.leftZone.addEventListener('pointermove', this.handleStickMove);
    this.leftZone.addEventListener('pointerup', this.handleStickUp);
    this.leftZone.addEventListener('pointercancel', this.handleStickUp);
    this.rightZone.addEventListener('pointerdown', this.handleFireDown);
    this.rightZone.addEventListener('pointerup', this.handleFireUp);
    this.rightZone.addEventListener('pointercancel', this.handleFireUp);
    [this.leftZone, this.rightZone].forEach((zone) =>
      zone.addEventListener('contextmenu', (event) => event.preventDefault()),
    );

    document.body.append(this.zones);

    // --- Desktop: keyboard aliases and mouse on the playfield ---
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
    stage.addEventListener('pointerdown', this.handleStagePointer);
    // Right-click drives the tank: no browser menu over the game
    stage.addEventListener('contextmenu', (event) => event.preventDefault());
    // Middle-click would start browser auto-scroll
    stage.addEventListener('auxclick', (event) => event.preventDefault());
    window.addEventListener('pointermove', this.handleMouseMove);
    window.addEventListener('pointerup', this.handleMouseUp);
    window.addEventListener('pointercancel', () => this.releaseMouse());

    // --- Switch modes with the device actually used ---
    window.addEventListener(
      'pointerdown',
      (event) => this.setMode(event.pointerType === 'touch' ? 'touch' : 'desktop'),
      true,
    );
    window.addEventListener('keydown', () => this.setMode('desktop'), true);

    gate.changed.addListener(() => this.refresh());
    new MutationObserver(() => this.refresh()).observe(uiLayer, { childList: true });

    const forceTouch = new URLSearchParams(window.location.search).get('touch') === '1';
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.mode = forceTouch || coarse ? 'touch' : 'desktop';
    this.applyMode();
  }

  public getMode(): ControlMode {
    return this.mode;
  }

  private setMode(mode: ControlMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.releaseAll();
    this.applyMode();
    this.modeChanged.notify(mode);
  }

  private applyMode(): void {
    document.documentElement.classList.toggle(TOUCH_UI_CLASS, this.mode === 'touch');
    this.refresh();
  }

  private refresh(): void {
    const panelOpen = this.uiLayer.querySelector(PANEL_SELECTOR) !== null;
    const touchActive = this.mode === 'touch' && !panelOpen && this.gate.isFree();
    if (!touchActive) {
      this.releaseTouch();
    }
    if (this.gate.getLevel() === null || !this.gate.isFree()) {
      this.releaseMouse();
    }
    this.zones.hidden = !touchActive;
  }

  // --- Desktop -------------------------------------------------------------

  private canUseAliases(): boolean {
    return this.gate.isFree() && !this.session.isMultiplayer();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || isTypingTarget(event.target) || !this.canUseAliases()) {
      return;
    }
    const key = event.key.toLowerCase();
    let controls: InputControl[] | null = null;
    if (key in WASD) {
      controls = [DIRECTION_CONTROLS[WASD[key]]];
    } else if (key === ' ') {
      controls = FIRE_CONTROLS;
      // Space must not scroll the page or press a focused button
      event.preventDefault();
    }
    if (controls === null || this.heldKeys.has(key)) {
      return;
    }
    this.heldKeys.set(key, controls);
    controls.forEach((control) => this.input.pressVirtual(control));
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const controls = this.heldKeys.get(key);
    if (controls !== undefined) {
      this.heldKeys.delete(key);
      controls.forEach((control) => this.input.releaseVirtual(control));
    }
  };

  private toFieldPoint(event: PointerEvent): FieldPoint | null {
    const rect = this.stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const canvasX = ((event.clientX - rect.left) / rect.width) * config.CANVAS_WIDTH;
    const canvasY = ((event.clientY - rect.top) / rect.height) * config.CANVAS_HEIGHT;
    return {
      x: canvasX - config.BORDER_LEFT_WIDTH,
      y: canvasY - config.BORDER_TOP_BOTTOM_HEIGHT,
    };
  }

  private handleStagePointer = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.gate.getLevel() === null) {
      return;
    }
    // Clicks on HUD buttons and panels are theirs, not the battlefield's
    const onCanvas = event.target instanceof HTMLCanvasElement;

    // Middle button and the side buttons open/close the Hub
    if (event.button === 1 || event.button === 3 || event.button === 4) {
      event.preventDefault();
      this.hubToggleRequested.notify(null);
      return;
    }

    if (!onCanvas || !this.gate.isFree()) {
      return;
    }
    const point = this.toFieldPoint(event);
    if (point === null) {
      return;
    }
    this.mouse = point;

    if (event.button === 2) {
      // Holding right-click drives toward the cursor
      this.rightHeld = true;
      return;
    }
    if (event.button !== 0) {
      return;
    }
    // Left-click: turn toward the cursor and fire. Pressing and dragging
    // also drives (see handleMouseMove).
    this.leftAnchor = { x: event.clientX, y: event.clientY };
    this.aimFire.notify(point);
  };

  private handleMouseMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.gate.getLevel() === null) {
      return;
    }
    const point = this.toFieldPoint(event);
    if (point === null) {
      return;
    }
    this.mouse = point;
    this.mouseMoved = true;
    if (
      this.leftAnchor !== null &&
      Math.hypot(event.clientX - this.leftAnchor.x, event.clientY - this.leftAnchor.y) >
        MOUSE_DRAG_DISTANCE
    ) {
      this.leftDragging = true;
    }
  };

  private handleMouseUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') {
      return;
    }
    if (event.button === 2) {
      this.rightHeld = false;
    } else if (event.button === 0) {
      this.leftAnchor = null;
      this.leftDragging = false;
    }
  };

  /** True while right-click is held, or left-click is held and dragged. */
  public isMouseDriving(): boolean {
    return (this.rightHeld || this.leftDragging) && this.gate.isFree();
  }

  /** Cursor position on the battlefield (field coordinates), if it moved. */
  public consumeMouseAim(): FieldPoint | null {
    if (!this.mouseMoved || this.mouse === null || !this.gate.isFree()) {
      return null;
    }
    this.mouseMoved = false;
    return this.mouse;
  }

  /**
   * Direction (in degrees, like Rotation) a tank at `center` must drive to
   * reach the cursor, or -1 when not driving or already there. Moves along
   * the longer axis first, so the tank follows the grid.
   */
  public getMouseDriveRotation(center: FieldPoint): number {
    if (!this.isMouseDriving() || this.mouse === null) {
      return -1;
    }
    const dx = this.mouse.x - center.x;
    const dy = this.mouse.y - center.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < MOUSE_ARRIVE_DISTANCE && ay < MOUSE_ARRIVE_DISTANCE) {
      return -1;
    }
    const horizontal = ax >= ay ? ax >= MOUSE_ARRIVE_DISTANCE : ay < MOUSE_ARRIVE_DISTANCE;
    if (horizontal) {
      return dx > 0 ? Rotation.Right : Rotation.Left;
    }
    return dy > 0 ? Rotation.Down : Rotation.Up;
  }

  /**
   * Single player: holds the movement key that drives the tank at `center`
   * toward the cursor (null stops). Co-op reads `getMouseDriveRotation`.
   */
  public syncMouseDrive(center: FieldPoint | null): void {
    const rotation = center === null ? -1 : this.getMouseDriveRotation(center);
    const direction = rotation < 0 ? null : ROTATION_DIRECTIONS[rotation as Rotation];
    if (direction === this.mouseDirection) {
      return;
    }
    if (this.mouseDirection !== null) {
      this.input.releaseVirtual(DIRECTION_CONTROLS[this.mouseDirection]);
    }
    this.mouseDirection = direction;
    if (direction !== null) {
      this.input.pressVirtual(DIRECTION_CONTROLS[direction]);
    }
  }

  private releaseMouse(): void {
    this.rightHeld = false;
    this.leftAnchor = null;
    this.leftDragging = false;
    this.syncMouseDrive(null);
  }

  // --- Touch: floating joystick --------------------------------------------

  private handleStickDown = (event: PointerEvent): void => {
    if (this.joystickPointer !== null) {
      return;
    }
    event.preventDefault();
    this.joystickPointer = event.pointerId;
    try {
      this.leftZone.setPointerCapture(event.pointerId);
    } catch {
      // Release still arrives via pointerup/pointercancel
    }
    this.joystickOrigin = { x: event.clientX, y: event.clientY };
    this.joystick.style.left = `${event.clientX}px`;
    this.joystick.style.top = `${event.clientY}px`;
    this.knob.style.transform = '';
    this.joystick.hidden = false;
  };

  private handleStickMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.joystickPointer) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - this.joystickOrigin.x;
    const dy = event.clientY - this.joystickOrigin.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / distance : 1;
    this.knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;

    if (distance < JOYSTICK_DEAD_ZONE) {
      this.setDirection(null);
    } else if (Math.abs(dx) > Math.abs(dy)) {
      // Four-way like the NES pad: the dominant axis wins
      this.setDirection(dx > 0 ? 'right' : 'left');
    } else {
      this.setDirection(dy > 0 ? 'down' : 'up');
    }
  };

  private handleStickUp = (event: PointerEvent): void => {
    if (event.pointerId === this.joystickPointer) {
      this.joystickPointer = null;
      this.joystick.hidden = true;
      this.setDirection(null);
    }
  };

  private setDirection(direction: Direction | null): void {
    if (direction === this.direction) {
      return;
    }
    if (this.direction !== null) {
      this.input.releaseVirtual(DIRECTION_CONTROLS[this.direction]);
    }
    this.direction = direction;
    if (direction !== null) {
      this.input.pressVirtual(DIRECTION_CONTROLS[direction]);
      navigator.vibrate?.(6);
    }
  }

  // --- Touch: fire zone ----------------------------------------------------

  private handleFireDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (this.firePointers.size === 0) {
      FIRE_CONTROLS.forEach((control) => this.input.pressVirtual(control));
    }
    this.firePointers.add(event.pointerId);
  };

  private handleFireUp = (event: PointerEvent): void => {
    if (!this.firePointers.delete(event.pointerId)) {
      return;
    }
    if (this.firePointers.size === 0) {
      FIRE_CONTROLS.forEach((control) => this.input.releaseVirtual(control));
    }
  };

  // --- Releasing -----------------------------------------------------------

  private releaseTouch(): void {
    this.joystickPointer = null;
    this.joystick.hidden = true;
    this.setDirection(null);
    if (this.firePointers.size > 0) {
      this.firePointers.clear();
      FIRE_CONTROLS.forEach((control) => this.input.releaseVirtual(control));
    }
  }

  private releaseAll(): void {
    this.releaseTouch();
    this.releaseMouse();
    this.heldKeys.forEach((controls) =>
      controls.forEach((control) => this.input.releaseVirtual(control)),
    );
    this.heldKeys.clear();
  }
}
