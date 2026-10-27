import { GameObject, Vector } from '../../core';
import { Painter } from '../../core/Painter';
import { RenderContext } from '../../core/render';
import { RenderObject } from '../../core/RenderObject';
import { GameUpdateArgs } from '../../game';
import * as config from '../../config';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ParticleBurstOptions {
  count: number;
  colors: string[];
  // Max initial speed in px/s.
  speed: number;
  // Max particle lifetime in seconds.
  life: number;
  size?: number;
}

// Velocity multiplier per second; keeps particles inside the burst box.
const DRAG = 0.04;

class ParticlePainter extends Painter {
  public particles: Particle[] = [];

  public paint(context: RenderContext, renderObject: RenderObject): void {
    const { min } = renderObject.getWorldBoundingBox();
    const prevAlpha = context.getGlobalAlpha();

    this.particles.forEach((particle) => {
      if (particle.life <= 0) {
        return;
      }
      context.setGlobalAlpha(prevAlpha * (particle.life / particle.maxLife));
      context.fillRect(
        Math.round(min.x + particle.x - particle.size / 2),
        Math.round(min.y + particle.y - particle.size / 2),
        particle.size,
        particle.size,
        particle.color,
      );
    });

    context.setGlobalAlpha(prevAlpha);
  }
}

/**
 * Short-lived square-pixel spray for explosions. Drawn as one object whose
 * box covers the whole burst, so the renderer clears it in a single rect.
 */
export class ParticleBurst extends GameObject {
  public zIndex = config.LARGE_EXPLOSION_Z_INDEX;
  public painter = new ParticlePainter();

  constructor(center: Vector, options: ParticleBurstOptions) {
    // Max travel with drag ~ speed * life / 2, plus room for particle size.
    const radius = Math.ceil((options.speed * options.life) / 2) + 8;
    super(radius * 2, radius * 2);

    this.position.set(center.x - radius, center.y - radius);

    const baseSize = options.size ?? 6;
    for (let i = 0; i < options.count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = options.speed * (0.35 + Math.random() * 0.65);
      const life = options.life * (0.5 + Math.random() * 0.5);
      this.painter.particles.push({
        x: radius,
        y: radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.max(2, Math.round(baseSize * (0.5 + Math.random()))),
        color: options.colors[i % options.colors.length],
        life,
        maxLife: life,
      });
    }
  }

  protected update({ deltaTime }: GameUpdateArgs): void {
    this.dirtyPaintBox();

    const drag = Math.pow(DRAG, deltaTime);
    let alive = 0;
    this.painter.particles.forEach((particle) => {
      if (particle.life <= 0) {
        return;
      }
      particle.life -= deltaTime;
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.vx *= drag;
      particle.vy *= drag;
      if (particle.life > 0) {
        alive += 1;
      }
    });

    if (alive === 0) {
      this.removeSelf();
      return;
    }

    this.setNeedsPaint();
  }
}
