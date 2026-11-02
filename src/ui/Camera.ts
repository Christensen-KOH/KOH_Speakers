import type { RenderCamera, RenderView } from '../core/GameRenderer';
import * as config from '../config';

import { drawArenaFloor } from './ArenaFloor';
import { TOUCH_UI_CLASS } from './touchUi';

export interface CameraFocus {
  // Tank centre in field coordinates and its facing in degrees (0 = up).
  x: number;
  y: number;
  rotation: number;
  moving: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  // Radius at birth and at the end of its life
  startSize: number;
  endSize: number;
  color: string;
}

// Touch screens: Gimkit-style compact HUD and a tighter view of the arena
export const FULLMAP_CLASS = 'tk-fullmap';
// Camera catches up with the tank at roughly this rate (per second).
const FOLLOW_RATE = 6;
// Zoom steps of 1/16: 16px terrain tiles then land on whole device pixels,
// so the unsmoothed sprites never show seams.
const ZOOM_STEP = 16;
// Exhaust: short hot flames at the tracks and slower smoke puffs that grow
// and fade behind the tank.
const FLAME_LIFE = 0.22;
const FLAME_COLORS = ['#ffd84a', '#ff9a2e', '#ff6a1f'];
const SMOKE_LIFE = 0.8;
const SMOKE_COLORS = ['#9aa5b4', '#b7c0cc', '#7f8a99'];
const MAX_PARTICLES = 90;
// Exhaust sits this far behind the tank centre
const EXHAUST_OFFSET = 28;
// Below this speed (px/s) the trail follows the facing instead
const MIN_TRAIL_SPEED = 20;

function snapZoom(zoom: number): number {
  return Math.max(1, Math.floor(zoom * ZOOM_STEP)) / ZOOM_STEP;
}

/**
 * Gimkit-style roaming camera. The canvas fills the stage at device
 * resolution; during a battle the world is drawn through
 * `ctx.translate(-camera.x, -camera.y)` with the camera lerping after the
 * local player's tank, while menus and notices are letterboxed to the classic
 * 1024x896 screen. DOM name tags and popups map through `canvasToLayer`,
 * pointer input back through `clientToCanvas`. Also paints the arena floor
 * and a flame/smoke exhaust trail behind the moving player tank.
 */
class BattleCamera {
  private stage: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly particles: Particle[] = [];
  // Last followed tank centre, to get its real driving direction
  private lastPx: number | null = null;
  private lastPy = 0;

  // Camera centre in canvas (world) px.
  private cx = config.CANVAS_WIDTH / 2;
  private cy = config.CANVAS_HEIGHT / 2;
  private lastTime = 0;
  private active = false;
  private fullmap = false;
  private view: RenderView = {
    width: 1,
    height: 1,
    world: { zoom: 1, x: 0, y: 0 },
    screen: { zoom: 1, x: 0, y: 0 },
  };

  public attach(canvas: HTMLCanvasElement, stage: HTMLElement): void {
    this.canvas = canvas;
    this.stage = stage;
  }

  /** A battle is starting: look at the base until the player tank shows up. */
  public startBattle(): void {
    this.setFullmap(document.documentElement.classList.contains(TOUCH_UI_CLASS));
    this.cx = config.BORDER_LEFT_WIDTH + config.BASE_DEFAULT_POSITION.x + 64;
    this.cy = config.BORDER_TOP_BOTTOM_HEIGHT + config.BASE_DEFAULT_POSITION.y + 48;
    this.lastTime = 0;
    this.active = true;
  }

  /** Called every frame with the local player's tank. */
  public follow(focus: CameraFocus): void {
    const now = performance.now();
    const dt = this.lastTime === 0 ? 0.016 : Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.setFullmap(document.documentElement.classList.contains(TOUCH_UI_CLASS));

    const px = config.BORDER_LEFT_WIDTH + focus.x;
    const py = config.BORDER_TOP_BOTTOM_HEIGHT + focus.y;
    if (!this.active) {
      this.cx = px;
      this.cy = py;
      this.active = true;
    } else {
      const k = 1 - Math.exp(-FOLLOW_RATE * dt);
      this.cx += (px - this.cx) * k;
      this.cy += (py - this.cy) * k;
    }

    this.updateParticles(focus, dt, px, py);
  }

  /** Level ended: back to the menu screen. */
  public reset(): void {
    this.active = false;
    this.lastTime = 0;
    this.setFullmap(false);
    this.particles.length = 0;
    this.lastPx = null;
    this.cx = config.CANVAS_WIDTH / 2;
    this.cy = config.CANVAS_HEIGHT / 2;
  }

  /** Called once per frame by the game loop, before rendering. */
  public getView(): RenderView {
    if (this.stage === null) {
      return this.view;
    }
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, this.stage.clientWidth);
    const cssH = Math.max(1, this.stage.clientHeight);
    const width = Math.round(cssW * dpr);
    const height = Math.round(cssH * dpr);

    // Classic screen, letterboxed and centred
    const fit = Math.min(width / config.CANVAS_WIDTH, height / config.CANVAS_HEIGHT);
    const screen = this.centred(
      snapZoom(fit),
      width,
      height,
      config.CANVAS_WIDTH / 2,
      config.CANVAS_HEIGHT / 2,
    );

    let world = screen;
    if (this.active) {
      // Desktop shows as much as the classic screen did; touch fills the
      // screen so the tank stays big under the thumbs.
      const cover = Math.max(width / config.CANVAS_WIDTH, height / config.CANVAS_HEIGHT);
      const zoom = snapZoom(this.fullmap ? cover : fit);
      const viewW = width / zoom;
      const viewH = height / zoom;
      const cx = this.clampAxis(this.cx, viewW, config.WORLD_WIDTH);
      const cy = this.clampAxis(this.cy, viewH, config.WORLD_HEIGHT);
      world = this.centred(zoom, width, height, cx, cy);
    }

    this.view = {
      width,
      height,
      world,
      screen,
      drawWorldBackground: this.active ? drawArenaFloor : undefined,
      drawWorldFx: this.particles.length > 0 ? this.drawParticles : undefined,
    };
    return this.view;
  }

  /** Screen point -> canvas (world) px, through the camera. */
  public clientToCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    if (this.canvas === null) {
      return null;
    }
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const { world } = this.view;
    const scale = this.view.width / rect.width;
    return {
      x: world.x + ((clientX - rect.left) * scale) / world.zoom,
      y: world.y + ((clientY - rect.top) * scale) / world.zoom,
    };
  }

  /** Canvas (world) px -> position inside the UI layer (CSS px). */
  public canvasToLayer(x: number, y: number): { left: number; top: number } | null {
    if (this.stage === null || this.stage.clientWidth === 0) {
      return null;
    }
    const { world } = this.view;
    const scale = this.stage.clientWidth / this.view.width;
    return {
      left: (x - world.x) * world.zoom * scale,
      top: (y - world.y) * world.zoom * scale,
    };
  }

  // Keeps the view inside the world; a world smaller than the view is centred.
  private clampAxis(centre: number, viewSize: number, worldSize: number): number {
    if (viewSize >= worldSize) {
      return worldSize / 2;
    }
    return Math.min(worldSize - viewSize / 2, Math.max(viewSize / 2, centre));
  }

  // Camera with `zoom` centred on (cx, cy), snapped to whole device pixels.
  private centred(
    zoom: number,
    width: number,
    height: number,
    cx: number,
    cy: number,
  ): RenderCamera {
    return {
      zoom,
      x: Math.round(cx * zoom - width / 2) / zoom,
      y: Math.round(cy * zoom - height / 2) / zoom,
    };
  }

  private setFullmap(fullmap: boolean): void {
    if (fullmap === this.fullmap) {
      return;
    }
    this.fullmap = fullmap;
    document.documentElement.classList.toggle(FULLMAP_CLASS, fullmap);
  }

  private updateParticles(focus: CameraFocus, dt: number, px: number, py: number): void {
    // Real driving direction (360°), falling back to the facing
    let dirX = 0;
    let dirY = 0;
    if (this.lastPx !== null && dt > 0) {
      const vx = (px - this.lastPx) / dt;
      const vy = (py - this.lastPy) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed >= MIN_TRAIL_SPEED) {
        dirX = vx / speed;
        dirY = vy / speed;
      }
    }
    if (dirX === 0 && dirY === 0) {
      const rad = (focus.rotation * Math.PI) / 180;
      dirX = Math.sin(rad);
      dirY = -Math.cos(rad);
    }
    this.lastPx = px;
    this.lastPy = py;

    if (focus.moving && this.particles.length < MAX_PARTICLES) {
      const backX = px - dirX * EXHAUST_OFFSET;
      const backY = py - dirY * EXHAUST_OFFSET;
      const spread = (): number => (Math.random() - 0.5) * 12;
      this.particles.push({
        x: backX + spread(),
        y: backY + spread(),
        vx: -dirX * 60 + spread() * 2,
        vy: -dirY * 60 + spread() * 2,
        life: FLAME_LIFE,
        maxLife: FLAME_LIFE,
        startSize: 5,
        endSize: 1.5,
        color: FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)],
      });
      this.particles.push({
        x: backX + spread(),
        y: backY + spread(),
        vx: -dirX * 25 + spread(),
        // Smoke drifts up a little
        vy: -dirY * 25 - 12 + spread(),
        life: SMOKE_LIFE,
        maxLife: SMOKE_LIFE,
        startSize: 4,
        endSize: 11,
        color: SMOKE_COLORS[Math.floor(Math.random() * SMOKE_COLORS.length)],
      });
    }

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  private drawParticles = (context: NativeContext): void => {
    for (const particle of this.particles) {
      const t = particle.life / particle.maxLife;
      const radius = particle.endSize + (particle.startSize - particle.endSize) * t;
      context.globalAlpha = 0.85 * t;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  };
}

export const battleCamera = new BattleCamera();
