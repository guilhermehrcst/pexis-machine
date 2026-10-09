// Three.js view of the machine. Imperative, framework-free, and observational:
// it renders component geometry and animates transfers that the simulator
// reported. It holds no machine state beyond what it was last told to show.
//
// Rendering is on demand: a frame is drawn only while the camera moves, while
// an animation is in flight, or after a resize/state change.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { MachineStatus } from '../machine/types';
import { buildPexisComputeModule } from './components/PexisComputeModule';
import { buildPexisFabric } from './components/PexisFabric';
import { buildPexisMemoryModule } from './components/PexisMemoryModule';
import { NO_INSETS, boxCorners, fitPointsToView, type FramingInsets } from './framing';
import { boxGeometry, roundedBoxGeometry } from './primitives';
import {
  MachineVisualRegistry,
  createVisualComponent,
  type MachineVisualComponent,
} from './semantic';
import type { ComponentId, StepVisual, Transfer, TransferKind } from './transfers';

export interface MachineSceneOptions {
  readonly onSelect: (id: ComponentId | null) => void;
  readonly ramLabel: string;
  readonly formatAddress: (address: bigint) => string;
}

const COLOR = {
  platform: 0xf4f2ed,
  grid: 0xe4e0d8,
  graphite: 0x2b2d32,
  graphiteSoft: 0x3a3d44,
  chip: 0x1b1c20,
  spreader: 0xcfd2d8,
  gold: 0xc8a75c,
  trace: 0xcac6bd,
  ghost: 0xe9e7e2,
  ghostEdge: 0xb4afa5,
  accent: 0x2f6bff,
  fetch: 0x7d8799,
  read: 0x2f6bff,
  write: 0x7a5af8,
  halted: 0x2f9e6b,
  faulted: 0xd4473b,
  ringIdle: 0x8f96a3,
} as const;

const TRANSFER_COLOR: Readonly<Record<TransferKind, number>> = {
  fetch: COLOR.fetch,
  read: COLOR.read,
  write: COLOR.write,
};

const TRANSFER_LABEL: Readonly<Record<TransferKind, string>> = {
  fetch: 'Fetch',
  read: 'Load',
  write: 'Store',
};

// Floor extent. The hardware spans about x -4.2..3.9 and z -2.3..2.2; the
// floor stays fully opaque over it and fades to nothing well before its edge.
const FLOOR = { width: 18, depth: 13 } as const;
const FLOOR_SOLID = 0.48; // normalised elliptical radius where the fade starts

const CPU_POS = new THREE.Vector3(0, 0, -1.25);
const RAM_POS = new THREE.Vector3(-2.85, 0, 1.35);
const GPU_POS = new THREE.Vector3(2.85, 0, 1.35);

// Authored 3/4 view. Only the direction is authored; distance and target are
// solved geometrically by fitPointsToView for every viewport.
const DEFAULT_VIEW_DIRECTION = new THREE.Vector3(2.6, 6.25, 8.45).normalize();
// Labels are DOM boxes above their anchor; reserve this much room above each
// anchor, along the camera's screen-up axis, so a fitted view never crops a
// label whatever the orbit angle.
const LABEL_ALLOWANCE = 0.45;

/** Overlay space in CSS pixels on each edge of the viewport. */
export type FramingInsetsPx = FramingInsets;

interface Animation {
  readonly transfer: Transfer;
  readonly start: number;
  readonly duration: number;
}

interface Lane {
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  readonly material: THREE.MeshStandardMaterial;
}

export class MachineScene {
  readonly #container: HTMLElement;
  readonly #options: MachineSceneOptions;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #labels: CSS2DRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  readonly #controls: OrbitControls;
  readonly #resize: ResizeObserver;
  readonly #raycaster = new THREE.Raycaster();
  readonly #pointer = new THREE.Vector2();
  readonly #hitTargets: THREE.Mesh[] = [];
  readonly #footprints = new Map<ComponentId, THREE.LineLoop>();
  readonly #labelElements = new Map<ComponentId, HTMLElement>();
  readonly #textures: THREE.Texture[] = [];
  readonly #components = new MachineVisualRegistry<ComponentId>();
  readonly #framingPoints: THREE.Vector3[] = [];
  readonly #labelAnchors: THREE.Vector3[] = [];
  #insetsPx: FramingInsetsPx = NO_INSETS;
  #userOrbited = false;

  #frame = 0;
  #pointerDown: { x: number; y: number } | null = null;
  #reducedMotion = false;
  #stepDurationMs = 600;

  // Data path
  #ramLanes: Lane[] = [];
  #pulse!: THREE.Group;
  #pulseCore!: THREE.MeshBasicMaterial;
  #pulseGlow!: THREE.SpriteMaterial;
  #pulseTag!: HTMLElement;
  #pulseTagObject!: CSS2DObject;
  #animations: Animation[] = [];
  #laneGlowUntil = 0;
  #laneGlowColor = new THREE.Color(COLOR.accent);

  // CPU activity ring
  #ringMaterial!: THREE.MeshStandardMaterial;
  #ringFlashUntil = 0;
  #status: MachineStatus = 'ready';
  #ramGlowMaterial!: THREE.MeshStandardMaterial;
  #ramGlowUntil = 0;

  constructor(container: HTMLElement, options: MachineSceneOptions) {
    this.#container = container;
    this.#options = options;

    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral keeps authored albedo: graphite stays graphite and
    // the platform stays off-white instead of ACES's grey, desaturated wash.
    this.#renderer.toneMapping = THREE.NeutralToneMapping;
    this.#renderer.toneMappingExposure = 1;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.domElement.className = 'scene-canvas';
    this.#renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.#renderer.domElement);

    this.#labels = new CSS2DRenderer();
    this.#labels.domElement.className = 'scene-labels';
    this.#labels.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.#labels.domElement);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.09;
    this.#controls.enablePan = false;
    this.#controls.minPolarAngle = 0.25;
    this.#controls.maxPolarAngle = 1.32;
    this.#controls.addEventListener('change', this.#requestRender);
    this.#controls.addEventListener('start', this.#onOrbitStart);

    this.#buildLights();
    this.#buildPlatform();
    this.#buildCpu();
    this.#buildRam();
    this.#buildGpu();
    this.#buildInterconnect();
    this.#buildPulse();
    this.#computeFramingPoints();

    const canvas = this.#renderer.domElement;
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointermove', this.#onPointerMove);

    this.#resize = new ResizeObserver(() => this.#onResize());
    this.#resize.observe(container);
    this.#onResize();
  }

  // ---------------------------------------------------------------- public

  /**
   * Screen space covered by HTML overlays (CSS px). The camera frames the
   * hardware inside the remaining area.
   */
  setFramingInsets(insets: FramingInsetsPx): void {
    const same =
      insets.top === this.#insetsPx.top &&
      insets.right === this.#insetsPx.right &&
      insets.bottom === this.#insetsPx.bottom &&
      insets.left === this.#insetsPx.left;
    if (same) return;
    this.#insetsPx = insets;
    this.#onResize();
  }

  setReducedMotion(reduced: boolean): void {
    this.#reducedMotion = reduced;
  }

  /** Visual budget for one step, derived from the browser run pace. */
  setStepDuration(ms: number): void {
    this.#stepDurationMs = Math.max(180, Math.min(900, ms));
  }

  setStatus(status: MachineStatus): void {
    this.#status = status;
    this.#requestRender();
  }

  setSelected(id: ComponentId | null): void {
    for (const [key, footprint] of this.#footprints) {
      footprint.visible = key === id;
    }
    for (const [key, element] of this.#labelElements) {
      element.classList.toggle('is-selected', key === id);
    }
    this.#requestRender();
  }

  /** Animates one simulator step. Replaces any animation still in flight. */
  play(visual: StepVisual): void {
    const now = performance.now();
    this.#animations = [];
    const count = visual.transfers.length;
    if (count > 0) {
      const slot = this.#stepDurationMs / count;
      visual.transfers.forEach((transfer, i) => {
        this.#animations.push({ transfer, start: now + i * slot, duration: slot * 0.92 });
      });
    }
    if (visual.cpu !== null) {
      this.#ringFlashUntil = now + this.#stepDurationMs + 220;
    }
    this.#requestRender();
  }

  /** Clears transient visuals, e.g. after reset or experiment switch. */
  clearActivity(): void {
    this.#animations = [];
    this.#ringFlashUntil = 0;
    this.#laneGlowUntil = 0;
    this.#ramGlowUntil = 0;
    this.#pulse.visible = false;
    this.#pulseTagObject.visible = false;
    this.#requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#resize.disconnect();
    const canvas = this.#renderer.domElement;
    canvas.removeEventListener('pointerdown', this.#onPointerDown);
    canvas.removeEventListener('pointerup', this.#onPointerUp);
    canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#controls.removeEventListener('change', this.#requestRender);
    this.#controls.removeEventListener('start', this.#onOrbitStart);
    this.#controls.dispose();

    const materials = new Set<THREE.Material>();
    this.#scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        object.geometry.dispose();
        const material = object.material as THREE.Material | THREE.Material[];
        for (const m of Array.isArray(material) ? material : [material]) materials.add(m);
      }
      if (object instanceof CSS2DObject) {
        object.element.remove();
      }
    });
    for (const material of materials) material.dispose();
    for (const texture of this.#textures) texture.dispose();
    this.#components.clear();
    this.#scene.clear();

    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    canvas.remove();
    this.#labels.domElement.remove();
  }

  // ---------------------------------------------------------------- build

  #buildLights(): void {
    this.#scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e4dc, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4.5, 9, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    this.#scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe7ff, 0.6);
    rim.position.set(-6, 4, -6);
    this.#scene.add(rim);
  }

  #buildPlatform(): void {
    // A seamless studio floor instead of a hard-edged slab. The camera frames
    // the hardware, not the floor, so a hard edge would be cropped differently
    // on every viewport and orbit and read as a broken render. The floor and
    // its grid fade out well before their edges and the stage background
    // continues them; no viewport can crop an edge because none is drawn.
    const { width, depth } = FLOOR;
    const fade = floorFadeTexture();
    this.#textures.push(fade);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({
        color: COLOR.platform,
        roughness: 0.92,
        metalness: 0,
        transparent: true,
        alphaMap: fade,
        depthWrite: false,
      }),
    );
    floor.name = 'stage.floor';
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    // Drawn first among transparent objects, so the planned GPU shell
    // (also transparent) is never washed out by the floor behind it.
    floor.renderOrder = -2;
    this.#scene.add(floor);

    // Fine engineering grid, very low contrast, faded with the same falloff.
    const positions: number[] = [];
    const alphas: number[] = [];
    const step = 0.5;
    const push = (x: number, z: number) => {
      positions.push(x, 0.002, z);
      alphas.push(1, 1, 1, floorFade(x / (width / 2), z / (depth / 2)));
    };
    for (let x = -width / 2; x <= width / 2 + 1e-6; x += step) {
      for (let z = -depth / 2; z < depth / 2 - 1e-6; z += step) {
        push(x, z);
        push(x, z + step);
      }
    }
    for (let z = -depth / 2; z <= depth / 2 + 1e-6; z += step) {
      for (let x = -width / 2; x < width / 2 - 1e-6; x += step) {
        push(x, z);
        push(x + step, z);
      }
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    gridGeometry.setAttribute('color', new THREE.Float32BufferAttribute(alphas, 4));
    const grid = new THREE.LineSegments(
      gridGeometry,
      new THREE.LineBasicMaterial({ color: COLOR.grid, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    grid.name = 'stage.grid';
    grid.renderOrder = -1;
    this.#scene.add(grid);
  }

  #buildCpu(): void {
    const build = buildPexisComputeModule();
    build.component.root.position.copy(CPU_POS);
    this.#ringMaterial = build.activityMaterial;
    this.#registerComponent(build.component);

    this.#addHitTarget(
      'cpu',
      boxGeometry(build.width + 0.12, build.height + 0.2, build.depth + 0.12),
      CPU_POS.clone().setY(build.height / 2),
    );
    this.#addFootprint('cpu', CPU_POS, build.width + 0.22, build.depth + 0.22);
    this.#addLabel(
      'cpu',
      'CPU',
      'Pexis Compute · functional core',
      CPU_POS.clone().add(new THREE.Vector3(0, build.height + 0.06, -build.depth / 2)),
    );
  }

  #buildRam(): void {
    const build = buildPexisMemoryModule();
    build.component.root.position.copy(RAM_POS);
    this.#ramGlowMaterial = build.activityMaterial;
    this.#registerComponent(build.component);

    // Same simulator-facing identity, interaction contract and CPU/RAM path.
    // Only the visual representation changes.
    this.#addHitTarget(
      'ram',
      boxGeometry(build.width + 0.14, build.height + 0.14, build.depth + 0.26),
      RAM_POS.clone().setY(build.height / 2),
    );
    this.#addFootprint('ram', RAM_POS, 3.0, 0.9);
    this.#addLabel(
      'ram',
      'RAM',
      this.#options.ramLabel,
      RAM_POS.clone().add(new THREE.Vector3(0, build.height + 0.08, -build.depth / 2)),
    );
  }

  #buildGpu(): void {
    const group = new THREE.Group();
    // GPU does not exist in the simulator. It is drawn as an empty, inert
    // outline so the planned topology is visible without implying activity.
    const geometry = roundedBoxGeometry(2.1, 0.22, 1.6, 3, 0.06);
    const shell = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: COLOR.ghost,
        roughness: 1,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    shell.position.copy(GPU_POS).setY(0.11);
    group.add(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineDashedMaterial({ color: COLOR.ghostEdge, dashSize: 0.08, gapSize: 0.06 }),
    );
    edges.computeLineDistances();
    edges.position.copy(shell.position);
    group.add(edges);

    // A reserved visual port only. No GPU hardware or data path is simulated.
    const graphicsPort = new THREE.Object3D();
    graphicsPort.name = 'anchor.fabric-planned-port';
    graphicsPort.position.set(GPU_POS.x - 1.35, 0.035, GPU_POS.z);
    group.add(graphicsPort);

    this.#registerComponent(
      createVisualComponent<ComponentId>({
        id: 'gpu',
        kind: 'graphics',
        root: group,
        parts: [
          { id: 'planned-shell', role: 'planned-placeholder', objects: [shell] },
          { id: 'planned-outline', role: 'planned-outline', objects: [edges] },
        ],
      }),
    );

    this.#addHitTarget('gpu', boxGeometry(2.2, 0.5, 1.7), GPU_POS.clone().setY(0.2));
    this.#addFootprint('gpu', GPU_POS, 2.4, 1.9);
    this.#addLabel('gpu', 'GPU', 'Planned · M4', GPU_POS.clone().setY(0.3), true);
  }

  #buildInterconnect(): void {
    // All ports must belong to the actual visual components. No anonymous
    // coordinate guessed inside the Fabric builder or new simulator topology.
    const ramPort = this.#components.getPart('ram', 'slot')?.anchor;
    const cpu = this.#components.getComponent('cpu');
    const gpu = this.#components.getComponent('gpu');
    const cpuPort = cpu?.root.getObjectByName('anchor.fabric-port');
    const cpuReservedPort = cpu?.root.getObjectByName('anchor.fabric-planned-port');
    const gpuReservedPort = gpu?.root.getObjectByName('anchor.fabric-planned-port');
    if (!ramPort || !cpuPort || !cpuReservedPort || !gpuReservedPort) {
      throw new Error('Missing semantic Pexis Fabric port: refusing disconnected geometry');
    }

    this.#scene.updateMatrixWorld(true);
    const build = buildPexisFabric({
      memory: ramPort.getWorldPosition(new THREE.Vector3()),
      compute: cpuPort.getWorldPosition(new THREE.Vector3()),
      graphicsReserved: gpuReservedPort.getWorldPosition(new THREE.Vector3()),
      computeReserved: cpuReservedPort.getWorldPosition(new THREE.Vector3()),
    });
    this.#ramLanes = [...build.activeLanes];
    this.#registerComponent(build.component);

    // Passive Fabric is independently selectable without stealing touch
    // targets from compute, RAM, or the still-planned GPU.
    this.#addHitTarget('interconnect', boxGeometry(1.5, 0.22, 1.76), new THREE.Vector3(0, 0.12, 0.7));
    this.#addHitTarget('interconnect', boxGeometry(1.32, 0.20, 0.34), new THREE.Vector3(-1.01, 0.12, 1.35));
    this.#addFootprint('interconnect', new THREE.Vector3(0, 0, 0.7), 1.66, 1.98);
    this.#addLabel(
      'interconnect',
      'Pexis Fabric',
      'CPU ↔ RAM · GPU planned',
      new THREE.Vector3(0, 0.24, 0.66),
    );
  }

  #buildPulse(): void {
    this.#pulse = new THREE.Group();
    this.#pulseCore = new THREE.MeshBasicMaterial({ color: COLOR.accent, toneMapped: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), this.#pulseCore);
    this.#pulse.add(core);

    const texture = glowTexture();
    this.#textures.push(texture);
    this.#pulseGlow = new THREE.SpriteMaterial({
      map: texture,
      color: COLOR.accent,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const glow = new THREE.Sprite(this.#pulseGlow);
    glow.scale.setScalar(0.8);
    this.#pulse.add(glow);
    this.#pulse.visible = false;
    this.#scene.add(this.#pulse);

    this.#pulseTag = document.createElement('div');
    this.#pulseTag.className = 'pulse-tag';
    this.#pulseTagObject = new CSS2DObject(this.#pulseTag);
    this.#pulseTagObject.visible = false;
    this.#scene.add(this.#pulseTagObject);
  }

  #registerComponent(component: MachineVisualComponent<ComponentId>): void {
    this.#components.register(component);
    this.#scene.add(component.root);
  }

  #addHitTarget(id: ComponentId, geometry: THREE.BufferGeometry, position: THREE.Vector3): void {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.copy(position);
    mesh.userData.componentId = id;
    this.#hitTargets.push(mesh);
    this.#scene.add(mesh);
  }

  #addFootprint(id: ComponentId, center: THREE.Vector3, width: number, depth: number): void {
    const shape = new THREE.Shape();
    roundedRect(shape, -width / 2, -depth / 2, width, depth, 0.14);
    const points = shape.getPoints(8).map((p) => new THREE.Vector3(p.x, 0.006, p.y));
    const loop = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: COLOR.accent, transparent: true, opacity: 0.9 }),
    );
    loop.position.set(center.x, 0, center.z);
    loop.visible = false;
    this.#footprints.set(id, loop);
    this.#scene.add(loop);
  }

  #addLabel(id: ComponentId, title: string, detail: string, position: THREE.Vector3, planned = false): void {
    const element = document.createElement('div');
    element.className = planned ? 'scene-label is-planned' : 'scene-label';
    const name = document.createElement('span');
    name.className = 'scene-label__title';
    name.textContent = title;
    const sub = document.createElement('span');
    sub.className = 'scene-label__detail';
    sub.textContent = detail;
    element.append(name, sub);
    const object = new CSS2DObject(element);
    // Bottom-centre anchoring: the label sits above its anchor point instead
    // of being centred on it, so it never covers the hardware it names.
    object.center.set(0.5, 1);
    object.position.copy(position);
    this.#labelElements.set(id, element);
    this.#scene.add(object);
  }

  // ---------------------------------------------------------------- frame

  #requestRender = (): void => {
    if (this.#frame === 0) {
      this.#frame = requestAnimationFrame(this.#loop);
    }
  };

  #loop = (now: number): void => {
    this.#frame = 0;
    const moving = this.#controls.update();
    const animating = this.#updateActivity(now);
    this.#renderer.render(this.#scene, this.#camera);
    this.#labels.render(this.#scene, this.#camera);
    if (moving || animating) {
      this.#requestRender();
    }
  };

  /** Returns true while anything is still changing. */
  #updateActivity(now: number): boolean {
    let active = false;

    // Transfers: one visible pulse, sequential per step.
    const current = this.#animations.find((a) => now < a.start + a.duration);
    if (current && now >= current.start) {
      const t = (now - current.start) / current.duration;
      this.#showTransfer(current.transfer, t);
      this.#laneGlowUntil = Math.max(this.#laneGlowUntil, now + 260);
      this.#ramGlowUntil = Math.max(this.#ramGlowUntil, now + 320);
      this.#laneGlowColor.setHex(TRANSFER_COLOR[current.transfer.kind]);
      active = true;
    } else {
      this.#pulse.visible = false;
      this.#pulseTagObject.visible = this.#reducedMotion && current !== undefined;
      if (current) active = true;
    }
    if (this.#animations.length > 0 && !current) {
      this.#animations = [];
    }

    // Lane glow decays after each transfer.
    const laneLeft = Math.max(0, this.#laneGlowUntil - now);
    const laneLevel = Math.min(1, laneLeft / 260);
    for (const lane of this.#ramLanes) {
      lane.material.emissive.copy(this.#laneGlowColor);
      lane.material.emissiveIntensity = laneLevel * 0.9;
    }
    const ramLeft = Math.max(0, this.#ramGlowUntil - now);
    this.#ramGlowMaterial.emissive.copy(this.#laneGlowColor);
    this.#ramGlowMaterial.emissiveIntensity = Math.min(1, ramLeft / 320) * 1.4;
    if (laneLeft > 0 || ramLeft > 0) active = true;

    // CPU ring: persistent status color plus a short activity flash.
    const flashLeft = Math.max(0, this.#ringFlashUntil - now);
    const base =
      this.#status === 'faulted' ? COLOR.faulted : this.#status === 'halted' ? COLOR.halted : COLOR.ringIdle;
    const flash = Math.min(1, flashLeft / 400);
    const terminal = this.#status === 'faulted' || this.#status === 'halted';
    this.#ringMaterial.emissive.setHex(terminal ? base : flash > 0 ? COLOR.accent : base);
    this.#ringMaterial.emissiveIntensity = terminal ? 0.9 + flash * 0.6 : 0.25 + flash * 1.2;
    if (flashLeft > 0) active = true;

    return active;
  }

  #showTransfer(transfer: Transfer, t: number): void {
    const lane = this.#ramLanes[1]!;
    const color = TRANSFER_COLOR[transfer.kind];
    // Lane curve runs RAM -> CPU. Writes travel the other way.
    const eased = easeInOut(Math.min(1, Math.max(0, t)));
    const along = transfer.from === 'ram' ? eased : 1 - eased;
    const point = this.#reducedMotion ? lane.curve.getPointAt(0.5) : lane.curve.getPointAt(along);

    this.#pulse.visible = !this.#reducedMotion;
    this.#pulse.position.copy(point);
    this.#pulseCore.color.setHex(color);
    this.#pulseGlow.color.setHex(color);
    this.#pulseGlow.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) + 0.15;

    const direction = transfer.from === 'ram' ? 'RAM → CPU' : 'CPU → RAM';
    const address = transfer.kind === 'fetch' ? '' : ` @ ${this.#options.formatAddress(transfer.address)}`;
    const text = `${TRANSFER_LABEL[transfer.kind]} ${transfer.bytes} B${address} · ${direction}`;
    if (this.#pulseTag.textContent !== text) {
      this.#pulseTag.textContent = text;
      this.#pulseTag.dataset.kind = transfer.kind;
    }
    this.#pulseTagObject.position.copy(point).add(new THREE.Vector3(0, 0.32, 0));
    this.#pulseTagObject.visible = true;
  }

  // ---------------------------------------------------------------- input

  #onResize(): void {
    const width = Math.max(1, this.#container.clientWidth);
    const height = Math.max(1, this.#container.clientHeight);
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.#renderer.setSize(width, height, false);
    this.#labels.setSize(width, height);
    this.#camera.aspect = width / height;
    this.#frame3d(width, height);
    this.#requestRender();
  }

  /**
   * Fits the hardware (not the platform) into the viewport area left free by
   * overlays. Until the user orbits, the authored direction is used; after
   * that, a resize or rotation keeps the user's viewing angle and refits.
   */
  #frame3d(width: number, height: number): void {
    const direction = this.#userOrbited
      ? this.#camera.position.clone().sub(this.#controls.target).normalize()
      : DEFAULT_VIEW_DIRECTION;
    const pad = 12; // breathing room in CSS px around the hardware
    const insets: FramingInsets = {
      top: (this.#insetsPx.top + pad) / height,
      bottom: (this.#insetsPx.bottom + pad) / height,
      left: (this.#insetsPx.left + pad) / width,
      right: (this.#insetsPx.right + pad) / width,
    };
    // Screen-up for this direction: world up with its component along the view
    // direction removed. Label room is reserved along it, not along world Y.
    const worldUp = new THREE.Vector3(0, 1, 0);
    const screenUp = worldUp.clone().addScaledVector(direction, -worldUp.dot(direction)).normalize();
    const labelPoints = this.#labelAnchors.map((anchor) => anchor.clone().addScaledVector(screenUp, LABEL_ALLOWANCE));
    const fit = fitPointsToView({
      points: [...this.#framingPoints, ...this.#labelAnchors, ...labelPoints],
      direction,
      fov: this.#camera.fov,
      aspect: this.#camera.aspect,
      insets,
    });
    this.#camera.zoom = 1;
    this.#camera.position.copy(fit.position);
    this.#controls.target.copy(fit.target);
    this.#controls.minDistance = fit.distance * 0.55;
    this.#controls.maxDistance = fit.distance * 1.8;
    this.#camera.updateProjectionMatrix();
    this.#controls.update();
  }

  #computeFramingPoints(): void {
    // Per-component boxes: a single enclosing box would also frame the empty
    // space between components and shrink the hardware for nothing.
    const points = this.#framingPoints;
    points.length = 0;
    for (const component of this.#components.values()) {
      points.push(...boxCorners(new THREE.Box3().setFromObject(component.root)));
    }
    // Selection outlines are wider than their components; a selected one must
    // not be clipped either.
    for (const footprint of this.#footprints.values()) {
      points.push(...boxCorners(new THREE.Box3().setFromObject(footprint)));
    }
    // Labels float above their anchors (see #addLabel); #frame3d reserves room
    // above each anchor along the screen-up axis of the chosen view.
    const anchors = this.#labelAnchors;
    anchors.length = 0;
    this.#scene.traverse((object) => {
      if (object instanceof CSS2DObject && object.element.classList.contains('scene-label')) {
        anchors.push(object.position.clone());
      }
    });
  }

  #onOrbitStart = (): void => {
    this.#userOrbited = true;
  };

  #onPointerDown = (event: PointerEvent): void => {
    this.#pointerDown = { x: event.clientX, y: event.clientY };
  };

  #onPointerUp = (event: PointerEvent): void => {
    const down = this.#pointerDown;
    this.#pointerDown = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) {
      return; // orbit drag, not a click
    }
    this.#options.onSelect(this.#pick(event));
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || event.buttons !== 0) return;
    this.#renderer.domElement.style.cursor = this.#pick(event) ? 'pointer' : 'grab';
  };

  #pick(event: PointerEvent): ComponentId | null {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hit = this.#raycaster.intersectObjects(this.#hitTargets, false)[0];
    return (hit?.object.userData.componentId as ComponentId | undefined) ?? null;
  }
}

// ------------------------------------------------------------------ helpers

function roundedRect(shape: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number): void {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
}

/** Floor opacity at a normalised elliptical position (|u|,|v| <= 1 at the floor edge). */
function floorFade(u: number, v: number): number {
  const r = Math.hypot(u, v);
  const t = Math.min(1, Math.max(0, (r - FLOOR_SOLID) / (0.95 - FLOOR_SOLID)));
  return 1 - t * t * (3 - 2 * t);
}

function floorFadeTexture(): THREE.Texture {
  // alphaMap samples the green channel; the floor plane's UVs span its full
  // extent, so the same falloff as floorFade() is rasterised here.
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = Math.round(255 * floorFade(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1));
        const i = (y * size + x) * 4;
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }
  return new THREE.CanvasTexture(canvas);
}

function glowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
