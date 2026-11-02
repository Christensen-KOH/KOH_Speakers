import * as THREE from 'three';

import { GameObject } from '../core';
import { AutoTurretPainter } from '../entities/AutoTurret';
import { Tag } from '../game';
import { Bullet, Tank, TerrainTile } from '../gameObjects';
import { BaseHeart } from '../gameObjects/BaseHeart';
import { PLAYER_COLORS, TankColor } from '../tank';
import { TerrainType } from '../terrain';
import { FULLMAP_CLASS, WorldProjector } from '../ui/Camera';
import * as config from '../config';

import { getIsoHint } from './IsoHint';

const HALF_FIELD = config.FIELD_SIZE / 2;
// Classic isometric view: 45 deg around Y, ~35 deg down
const VIEW_YAW = Math.PI / 4;
const VIEW_PITCH = THREE.MathUtils.degToRad(35.264);
const CAMERA_DISTANCE = 2000;
// Touch screens zoom in on the player; half the visible height in px
const TOUCH_VIEW_HALF_HEIGHT = 300;
const FOLLOW_RATE = 6;

const TANK_COLORS: Record<string, string> = {
  [TankColor.Default]: '#9aa3ad',
  [TankColor.Primary]: '#e8b830',
  [TankColor.Secondary]: '#4cb050',
  [TankColor.Danger]: '#d83a3a',
  [TankColor.Gold]: '#ffcf3d',
  [TankColor.Boss]: '#b0203a',
};
const EXTRA_PLAYER_COLORS = ['#4aa8ff', '#ff6fb0', '#a070ff', '#ff8a2a', '#40e0d0', '#e0e0e0'];
PLAYER_COLORS.slice(2).forEach((color, index) => {
  TANK_COLORS[color] = EXTRA_PLAYER_COLORS[index % EXTRA_PLAYER_COLORS.length];
});

type TerrainKind = 'brick' | 'steel' | 'water' | 'ice' | 'jungle' | 'pad';

interface TerrainStyle {
  color: string;
  height: number;
  // Tiles shrink a hair so neighbours read as separate blocks
  inset: number;
  opacity?: number;
  emissive?: string;
}

const TERRAIN_STYLES: Record<TerrainKind, TerrainStyle> = {
  brick: { color: '#a0522d', height: 28, inset: 1 },
  steel: { color: '#4a4f57', height: 36, inset: 1 },
  water: { color: '#2a6fd6', height: 2, inset: 0, emissive: '#0b2a66' },
  ice: { color: '#cfe8f5', height: 1, inset: 0 },
  jungle: { color: '#2e8b3a', height: 44, inset: 2, opacity: 0.8 },
  pad: { color: '#ffcf3d', height: 2, inset: 6, emissive: '#5a4300' },
};

const TERRAIN_KINDS: Partial<Record<string, TerrainKind>> = {
  [TerrainType.Brick]: 'brick',
  [TerrainType.Steel]: 'steel',
  [TerrainType.Water]: 'water',
  [TerrainType.Ice]: 'ice',
  [TerrainType.Jungle]: 'jungle',
  [TerrainType.RechargePad]: 'pad',
  [TerrainType.UpgradePad]: 'pad',
};

interface TerrainLayer {
  mesh: THREE.InstancedMesh;
  style: TerrainStyle;
  count: number;
}

type ActorKind = 'tank' | 'bullet' | 'base' | 'turret';

interface Actor {
  kind: ActorKind;
  root: THREE.Object3D;
  color: string;
  dead: boolean;
}

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuaternion = new THREE.Quaternion();

/**
 * Isometric WebGL view of the battlefield. The headless game objects keep
 * all logic (physics, AI, network replica); every frame this mirrors their
 * field positions onto 3D primitives: field (x, y) -> world (x, 0, z).
 * Menus and other non-battle screens keep the 2D canvas.
 */
export class IsoWorldRenderer implements WorldProjector {
  private readonly renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  private readonly cameraOffset = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly fitBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private readonly terrain = new Map<TerrainKind, TerrainLayer>();
  private readonly actors = new Map<GameObject, Actor>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geometries = {
    hull: new THREE.BoxGeometry(52, 18, 58),
    turret: new THREE.BoxGeometry(30, 14, 30),
    barrel: new THREE.CylinderGeometry(4, 4, 32, 10).rotateX(Math.PI / 2),
    bullet: new THREE.SphereGeometry(6, 10, 8),
    base: new THREE.ConeGeometry(30, 46, 4).rotateY(Math.PI / 4),
    turretPost: new THREE.CylinderGeometry(14, 16, 20, 12),
  };
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly stage: HTMLElement;
  private width = 0;
  private height = 0;
  private active = false;
  private lastTime = 0;
  private zoomed = false;

  constructor(stage: HTMLElement) {
    this.stage = stage;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // No WebGL: the battle stays on the 2D canvas
      return;
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#0e0f14');
    this.renderer.domElement.className = 'tk-iso-canvas';
    // three sets display:block inline; CSS decides when the view shows
    this.renderer.domElement.style.display = '';
    // Behind the UI layer, on top of the (hidden) 2D canvas
    stage.insertBefore(this.renderer.domElement, stage.firstChild.nextSibling);

    this.setupScene();
    this.setupCamera();
  }

  public isActive(): boolean {
    return this.active;
  }

  public getDomElement(): HTMLCanvasElement | null {
    return this.renderer === null ? null : this.renderer.domElement;
  }

  /**
   * Mirrors the scene graph and draws a frame. `battle` turns the 3D view on;
   * `focus` (field coordinates) is followed on touch screens.
   */
  public render(root: GameObject, battle: boolean, focus: { x: number; y: number } | null): void {
    const active = battle && this.renderer !== null;
    if (active !== this.active) {
      this.active = active;
      document.documentElement.classList.toggle('tk-iso', active);
      if (!active) {
        this.clearActors();
        this.lastTime = 0;
      }
    }
    if (!active) {
      return;
    }

    const now = performance.now();
    const dt = this.lastTime === 0 ? 0 : Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.resize();
    this.sync(root);
    this.updateCamera(focus, dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen point -> field coordinates on the ground plane. */
  public clientToField(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.active) {
      return null;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit) === null) {
      return null;
    }
    return { x: hit.x + HALF_FIELD, y: hit.z + HALF_FIELD };
  }

  /** Field coordinates -> CSS px inside the stage. */
  public fieldToStage(x: number, y: number): { left: number; top: number } | null {
    if (!this.active || this.width === 0) {
      return null;
    }
    const point = new THREE.Vector3(x - HALF_FIELD, 0, y - HALF_FIELD).project(this.camera);
    return {
      left: ((point.x + 1) / 2) * this.width,
      top: ((1 - point.y) / 2) * this.height,
    };
  }

  private setupScene(): void {
    const ambient = new THREE.AmbientLight('#ffffff', 0.55);

    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(-350, 700, 250);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = -HALF_FIELD - 60;
    shadowCamera.right = HALF_FIELD + 60;
    shadowCamera.top = HALF_FIELD + 60;
    shadowCamera.bottom = -HALF_FIELD - 60;
    shadowCamera.near = 10;
    shadowCamera.far = 2000;
    sun.shadow.bias = -0.0005;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(config.FIELD_SIZE, config.FIELD_SIZE).rotateX(-Math.PI / 2),
      this.material('#1c1e24'),
    );
    ground.receiveShadow = true;

    // Grey arena rim, like the classic border
    const rimSize = config.FIELD_SIZE + config.TILE_SIZE_LARGE;
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(rimSize, 20, rimSize),
      this.material('#6b6f78'),
    );
    rim.position.y = -10.5;
    rim.receiveShadow = true;

    this.scene.add(ambient, sun, sun.target, ground, rim);

    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    (Object.keys(TERRAIN_STYLES) as TerrainKind[]).forEach((kind) => {
      const style = TERRAIN_STYLES[kind];
      const material = new THREE.MeshStandardMaterial({
        color: style.color,
        emissive: style.emissive ?? '#000000',
        roughness: kind === 'steel' || kind === 'ice' ? 0.35 : 0.85,
        metalness: kind === 'steel' ? 0.5 : 0,
        transparent: style.opacity !== undefined,
        opacity: style.opacity ?? 1,
        flatShading: true,
      });
      const layer: TerrainLayer = {
        mesh: this.createTerrainMesh(box, material, 256),
        style,
        count: 0,
      };
      layer.mesh.castShadow = style.height > 4;
      layer.mesh.receiveShadow = true;
      this.terrain.set(kind, layer);
      this.scene.add(layer.mesh);
    });
  }

  private createTerrainMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
  }

  private setupCamera(): void {
    this.cameraOffset
      .set(
        Math.sin(VIEW_YAW) * Math.cos(VIEW_PITCH),
        Math.sin(VIEW_PITCH),
        Math.cos(VIEW_YAW) * Math.cos(VIEW_PITCH),
      )
      .multiplyScalar(CAMERA_DISTANCE);
    this.placeCamera();

    // Bounds of the whole arena (plus wall height) as seen by the camera,
    // so desktop can always frame the full map.
    this.camera.updateMatrixWorld(true);
    const edge = HALF_FIELD + config.TILE_SIZE_MEDIUM;
    const box = this.fitBox;
    box.minX = Infinity;
    box.minY = Infinity;
    box.maxX = -Infinity;
    box.maxY = -Infinity;
    [-edge, edge].forEach((x) =>
      [-edge, edge].forEach((z) =>
        [0, 48].forEach((y) => {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
          box.minX = Math.min(box.minX, p.x);
          box.maxX = Math.max(box.maxX, p.x);
          box.minY = Math.min(box.minY, p.y);
          box.maxY = Math.max(box.maxY, p.y);
        }),
      ),
    );
  }

  private placeCamera(): void {
    this.camera.position.copy(this.target).add(this.cameraOffset);
    this.camera.lookAt(this.target);
  }

  private resize(): void {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.applyFrustum();
  }

  private applyFrustum(): void {
    const aspect = this.width / Math.max(1, this.height);
    let halfH: number;
    let centerX = 0;
    let centerY = 0;
    if (this.zoomed) {
      halfH = TOUCH_VIEW_HALF_HEIGHT;
    } else {
      const box = this.fitBox;
      const halfW = (box.maxX - box.minX) / 2;
      halfH = Math.max((box.maxY - box.minY) / 2, halfW / aspect);
      centerX = (box.maxX + box.minX) / 2;
      centerY = (box.maxY + box.minY) / 2;
    }
    this.camera.left = centerX - halfH * aspect;
    this.camera.right = centerX + halfH * aspect;
    this.camera.top = centerY + halfH;
    this.camera.bottom = centerY - halfH;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(focus: { x: number; y: number } | null, dt: number): void {
    const zoomed = document.documentElement.classList.contains(FULLMAP_CLASS);
    if (zoomed !== this.zoomed) {
      this.zoomed = zoomed;
      this.applyFrustum();
      if (!zoomed) {
        this.target.set(0, 0, 0);
      }
    }
    if (zoomed && focus !== null) {
      const tx = focus.x - HALF_FIELD;
      const tz = focus.y - HALF_FIELD;
      const k = dt === 0 ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt);
      this.target.x += (tx - this.target.x) * k;
      this.target.z += (tz - this.target.z) * k;
    }
    this.placeCamera();
  }

  private sync(root: GameObject): void {
    this.terrain.forEach((layer) => {
      layer.count = 0;
    });
    const seen = new Set<GameObject>();

    root.traverseDescedants((object: GameObject) => {
      if (!object.getWorldVisible()) {
        return;
      }

      if (object instanceof TerrainTile) {
        const kind = TERRAIN_KINDS[object.type];
        if (kind !== undefined) {
          this.addTerrain(kind, object);
        }
        return;
      }

      const kind = this.getActorKind(object);
      if (kind === null) {
        return;
      }
      seen.add(object);
      this.syncActor(object, kind);
    });

    this.terrain.forEach((layer) => {
      layer.mesh.count = layer.count;
      layer.mesh.instanceMatrix.needsUpdate = true;
    });

    this.actors.forEach((actor, object) => {
      if (!seen.has(object)) {
        this.scene.remove(actor.root);
        this.actors.delete(object);
      }
    });
  }

  private addTerrain(kind: TerrainKind, object: GameObject): void {
    let layer = this.terrain.get(kind);
    if (layer.count >= layer.mesh.instanceMatrix.count) {
      // Grow: a full brick map has a few thousand tiles
      const bigger = this.createTerrainMesh(
        layer.mesh.geometry,
        layer.mesh.material as THREE.Material,
        layer.mesh.instanceMatrix.count * 2,
      );
      bigger.castShadow = layer.mesh.castShadow;
      bigger.receiveShadow = true;
      this.scene.remove(layer.mesh);
      layer.mesh.dispose();
      layer = { ...layer, mesh: bigger };
      this.terrain.set(kind, layer);
      this.scene.add(bigger);
    }

    const box = object.getWorldBoundingBox();
    const { style } = layer;
    const width = box.max.x - box.min.x - style.inset * 2;
    const depth = box.max.y - box.min.y - style.inset * 2;
    tmpPosition.set(
      (box.min.x + box.max.x) / 2 - config.BORDER_LEFT_WIDTH - HALF_FIELD,
      0,
      (box.min.y + box.max.y) / 2 - config.BORDER_TOP_BOTTOM_HEIGHT - HALF_FIELD,
    );
    tmpScale.set(Math.max(1, width), style.height, Math.max(1, depth));
    tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
    layer.mesh.setMatrixAt(layer.count, tmpMatrix);
    layer.count += 1;
  }

  private getActorKind(object: GameObject): ActorKind | null {
    if (object instanceof Tank) {
      return 'tank';
    }
    if (object instanceof Bullet) {
      return 'bullet';
    }
    if (object instanceof BaseHeart) {
      return 'base';
    }
    if (object.painter instanceof AutoTurretPainter) {
      return 'turret';
    }
    const hint = getIsoHint(object);
    return hint === null ? null : hint.kind;
  }

  private syncActor(object: GameObject, kind: ActorKind): void {
    const hint = getIsoHint(object);
    let color = '#ffffff';
    let dead = false;
    let facing = object.rotation;

    if (object instanceof Tank) {
      const isPlayer = object.tags.includes(Tag.Player);
      color = isPlayer
        ? TANK_COLORS[PLAYER_COLORS[object.partyIndex % PLAYER_COLORS.length]]
        : TANK_COLORS[TankColor.Default];
    } else if (object instanceof BaseHeart) {
      dead = object.isDestroyed();
    } else if (hint !== null) {
      color = TANK_COLORS[hint.color] ?? color;
      dead = hint.dead === true;
      facing = hint.facing ?? 0;
    }

    let actor = this.actors.get(object);
    if (actor === undefined || actor.color !== color || actor.dead !== dead) {
      if (actor !== undefined) {
        this.scene.remove(actor.root);
      }
      actor = { kind, color, dead, root: this.createActor(kind, color, dead) };
      this.actors.set(object, actor);
      this.scene.add(actor.root);
    }

    const box = object.getWorldBoundingBox();
    actor.root.position.set(
      (box.min.x + box.max.x) / 2 - config.BORDER_LEFT_WIDTH - HALF_FIELD,
      0,
      (box.min.y + box.max.y) / 2 - config.BORDER_TOP_BOTTOM_HEIGHT - HALF_FIELD,
    );
    if (kind === 'tank') {
      actor.root.rotation.y = -THREE.MathUtils.degToRad(facing);
    }
  }

  private createActor(kind: ActorKind, color: string, dead: boolean): THREE.Object3D {
    const group = new THREE.Group();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number, z = 0): void => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };

    if (kind === 'tank') {
      const body = this.material(color);
      add(this.geometries.hull, this.material('#2b2d33'), 9);
      add(this.geometries.turret, body, 25);
      add(this.geometries.barrel, body, 25, -22);
      // Tinted hull top so the team colour reads from above
      const deck = new THREE.Mesh(new THREE.BoxGeometry(44, 4, 46), body);
      deck.position.y = 19;
      deck.castShadow = true;
      group.add(deck);
    } else if (kind === 'bullet') {
      const shell = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffcf3d' });
      add(this.geometries.bullet, shell, 18);
    } else if (kind === 'base') {
      add(this.geometries.base, this.material(dead ? '#3a3a3a' : '#ffcf3d'), 23);
    } else {
      add(this.geometries.turretPost, this.material('#5d636e'), 10);
      add(this.geometries.turret, this.material('#8a919c'), 25);
    }
    return group;
  }

  private material(color: string): THREE.MeshStandardMaterial {
    let material = this.materials.get(color);
    if (material === undefined) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
      this.materials.set(color, material);
    }
    return material;
  }

  private clearActors(): void {
    this.actors.forEach((actor) => this.scene.remove(actor.root));
    this.actors.clear();
  }
}
