import { CanvasRenderContext } from './render';

import { RenderObject } from './RenderObject';

export interface GameRendererOptions {
  debug?: boolean;
  height?: number;
  width?: number;
}

const DEFAULT_OPTIONS = {
  debug: false,
  height: 640,
  width: 640,
};

/** Where one layer is looked at: device px per logical px, and the top-left. */
export interface RenderCamera {
  zoom: number;
  x: number;
  y: number;
}

export interface RenderView {
  // Canvas backing size in device pixels
  width: number;
  height: number;
  // Game world (battlefield), follows the player
  world: RenderCamera;
  // Menus and on-screen notices (objects flagged `screenSpace`)
  screen: RenderCamera;
  // Extra world-space drawing after the world layer (e.g. exhaust sparks)
  drawWorldFx?: (context: NativeContext) => void;
}

/**
 * Crisp 2D canvas renderer. The canvas fills the viewport and every frame is
 * redrawn: the world layer through a scrolling camera (ctx.translate by
 * -camera.x/-camera.y), culled to what is on screen, then the screen layer.
 */
export class GameRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: GameRendererOptions;
  private readonly context: CanvasRenderContext;

  constructor(options: GameRendererOptions = {}) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;

    this.context = new CanvasRenderContext(this.canvas);
    this.context.init();
  }

  public getDomElement(): HTMLCanvasElement {
    return this.canvas;
  }

  public render(root: RenderObject, view: RenderView): void {
    if (this.canvas.width !== view.width || this.canvas.height !== view.height) {
      this.canvas.width = view.width;
      this.canvas.height = view.height;
      this.context.init();
    }

    // Only objects that actually need it recalculate their matrix (dirty flag)
    root.updateWorldMatrix(false, true);

    const worldObjects: RenderObject[] = [];
    const screenObjects: RenderObject[] = [];
    this.collect(root, false, worldObjects, screenObjects);

    const native = this.context.getNative();
    native.setTransform(1, 0, 0, 1, 0, 0);
    native.clearRect(0, 0, view.width, view.height);

    const { world } = view;
    this.applyCamera(native, world);
    const minX = world.x;
    const minY = world.y;
    const maxX = world.x + view.width / world.zoom;
    const maxY = world.y + view.height / world.zoom;
    const visible = worldObjects.filter((object) => {
      const box = object.getWorldBoundingBox();
      return box.max.x >= minX && box.min.x <= maxX && box.max.y >= minY && box.min.y <= maxY;
    });
    this.paintAll(visible);

    if (view.drawWorldFx !== undefined) {
      view.drawWorldFx(native);
    }

    this.applyCamera(native, view.screen);
    this.paintAll(screenObjects);

    native.setTransform(1, 0, 0, 1, 0, 0);
  }

  private applyCamera(native: NativeContext, camera: RenderCamera): void {
    native.setTransform(1, 0, 0, 1, 0, 0);
    native.scale(camera.zoom, camera.zoom);
    native.translate(-camera.x, -camera.y);
  }

  private collect(
    object: RenderObject,
    screenSpace: boolean,
    worldObjects: RenderObject[],
    screenObjects: RenderObject[],
  ): void {
    // Removed children no longer need their old area cleared: every frame
    // starts from a blank canvas.
    if (object.removedChildren.length > 0) {
      object.cleanupRemoved();
    }
    object.resetPrevDirtyBox();

    for (const child of object.children) {
      const childScreen = screenSpace || child.screenSpace;
      if (childScreen) {
        screenObjects.push(child);
      } else {
        worldObjects.push(child);
      }
      this.collect(child, childScreen, worldObjects, screenObjects);
    }
  }

  private paintAll(objects: RenderObject[]): void {
    objects.sort((a, b) => a.getWorldZIndex() - b.getWorldZIndex());
    for (const object of objects) {
      this.renderObject(object);
    }
  }

  private renderObject(renderObject: RenderObject): void {
    if (this.options.debug) {
      const box = renderObject.getWorldBoundingBox();
      this.context.strokeRect(
        box.min.x,
        box.min.y,
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        '#fff',
      );
    }

    if (!renderObject.canRender()) {
      return;
    }

    if (renderObject.isRemoved) {
      return;
    }

    renderObject.painter.paint(this.context, renderObject);
    renderObject.resetNeedsPaint();
  }
}
