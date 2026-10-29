import * as config from '../config';

import { TOUCH_UI_CLASS } from './touchUi';

export interface CameraFocus {
  // Tank centre in field coordinates and its facing in degrees (0 = up).
  x: number;
  y: number;
  rotation: number;
  moving: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// Touch screens zoom in on the player; desktop keeps the whole arena in view.
const ZOOM_PORTRAIT = 1.7;
const ZOOM_LANDSCAPE = 1.4;
// Camera catches up with the tank at roughly this rate (per second).
const FOLLOW_RATE = 6;
const SPARK_LIFE = 0.4;
const SPARK_COLORS = ['#ffcf3d', '#ff8a2a', '#e8ecf8'];
const MAX_SPARKS = 60;

/**
 * Smooth follow camera for the battlefield. The canvas, the DOM name tags and
 * the spark layer share one CSS transform, so everything stays aligned while
 * the world scrolls; pointer input is mapped back through `clientToCanvas`.
 * Also draws an exhaust spark trail behind the moving player tank.
 */
class BattleCamera {
  private stage: HTMLElement | null = null;
  private layer: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly fx = document.createElement('canvas');
  private fxContext: CanvasRenderingContext2D | null = null;
  private readonly sparks: Spark[] = [];

  // Camera centre in canvas px.
  private cx = config.CANVAS_WIDTH / 2;
  private cy = config.CANVAS_HEIGHT / 2;
  private zoom = 1;
  private tx = 0;
  private ty = 0;
  private lastTime = 0;
  private active = false;

  public attach(canvas: HTMLCanvasElement, stage: HTMLElement, layer: HTMLElement): void {
    this.canvas = canvas;
    this.stage = stage;
    this.layer = layer;
    this.fx.width = canvas.width;
    this.fx.height = canvas.height;
    this.fx.className = 'tk-fx';
    this.fxContext = this.fx.getContext('2d');
    if (this.fxContext) {
      this.fxContext.imageSmoothingEnabled = false;
    }
    stage.insertBefore(this.fx, layer);
  }

  /** Called every frame with the local player's tank. */
  public follow(focus: CameraFocus): void {
    if (this.stage === null) {
      return;
    }
    const now = performance.now();
    const dt = this.lastTime === 0 ? 0.016 : Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const touch = document.documentElement.classList.contains(TOUCH_UI_CLASS);
    const portrait = window.innerHeight >= window.innerWidth;
    this.zoom = touch ? (portrait ? ZOOM_PORTRAIT : ZOOM_LANDSCAPE) : 1;

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

    this.updateSparks(focus, dt, px, py);
    this.apply();
  }

  /** Level ended: back to the whole arena. */
  public reset(): void {
    this.active = false;
    this.lastTime = 0;
    this.zoom = 1;
    this.sparks.length = 0;
    this.fxContext?.clearRect(0, 0, this.fx.width, this.fx.height);
    this.cx = config.CANVAS_WIDTH / 2;
    this.cy = config.CANVAS_HEIGHT / 2;
    this.apply();
  }

  /** Screen point -> canvas px, through the camera transform. */
  public clientToCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    if (this.stage === null) {
      return null;
    }
    const rect = this.stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const scaledW = rect.width * this.zoom;
    const scaledH = rect.height * this.zoom;
    return {
      x: ((clientX - rect.left - this.tx) / scaledW) * config.CANVAS_WIDTH,
      y: ((clientY - rect.top - this.ty) / scaledH) * config.CANVAS_HEIGHT,
    };
  }

  private apply(): void {
    if (this.stage === null || this.canvas === null || this.layer === null) {
      return;
    }
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    const z = this.zoom;
    this.tx = Math.min(0, Math.max(w - w * z, w / 2 - (this.cx / config.CANVAS_WIDTH) * w * z));
    this.ty = Math.min(0, Math.max(h - h * z, h / 2 - (this.cy / config.CANVAS_HEIGHT) * h * z));
    const transform =
      z === 1 ? '' : `translate(${this.tx.toFixed(1)}px, ${this.ty.toFixed(1)}px) scale(${z})`;
    const origin = z === 1 ? '' : '0 0';

    const targets: HTMLElement[] = [this.canvas, this.fx];
    this.layer.querySelectorAll<HTMLElement>('.tk-tags').forEach((node) => targets.push(node));
    targets.forEach((node) => {
      if (node.style.transform !== transform) {
        node.style.transform = transform;
        node.style.transformOrigin = origin;
      }
    });
  }

  private updateSparks(focus: CameraFocus, dt: number, px: number, py: number): void {
    const context = this.fxContext;
    if (context === null) {
      return;
    }
    if (focus.moving && this.sparks.length < MAX_SPARKS) {
      // Behind the tank: opposite of its facing
      const rad = (focus.rotation * Math.PI) / 180;
      const fx = Math.sin(rad);
      const fy = -Math.cos(rad);
      for (let i = 0; i < 2; i += 1) {
        this.sparks.push({
          x: px - fx * 26 + (Math.random() - 0.5) * 10,
          y: py - fy * 26 + (Math.random() - 0.5) * 10,
          vx: -fx * 30 + (Math.random() - 0.5) * 30,
          vy: -fy * 30 + (Math.random() - 0.5) * 30,
          life: SPARK_LIFE,
          color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
        });
      }
    }

    context.clearRect(0, 0, this.fx.width, this.fx.height);
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i];
      spark.life -= dt;
      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      const size = 2 + Math.round((spark.life / SPARK_LIFE) * 4);
      context.globalAlpha = spark.life / SPARK_LIFE;
      context.fillStyle = spark.color;
      context.fillRect(Math.round(spark.x), Math.round(spark.y), size, size);
    }
    context.globalAlpha = 1;
  }
}

export const battleCamera = new BattleCamera();
