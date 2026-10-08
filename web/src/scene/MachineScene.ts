// Three.js view of the machine. Imperative, framework-free, and observational:
// it renders component geometry and animates transfers that the simulator
// reported. It holds no machine state beyond what it was last told to show.
//
// Rendering is on demand: a frame is drawn only while the camera moves, while
// an animation is in flight, or after a resize/state change.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { MachineStatus } from '../machine/types';
import type { ComponentId, StepVisual, Transfer, TransferKind } from './transfers';

export interface MachineSceneOptions {
  readonly onSelect: (id: ComponentId | null) => void;
  readonly ramLabel: string;
  readonly formatAddress: (address: bigint) => string;
}

const COLOR = {
  platform: 0xfbfaf7,
  platformEdge: 0xe9e6df,
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

const Y_TRACE = 0.035;
const CPU_POS = new THREE.Vector3(0, 0, -1.25);
const RAM_POS = new THREE.Vector3(-2.85, 0, 1.35);
const GPU_POS = new THREE.Vector3(2.85, 0, 1.35);

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
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.domElement.className = 'scene-canvas';
    this.#renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.#renderer.domElement);

    this.#labels = new CSS2DRenderer();
    this.#labels.domElement.className = 'scene-labels';
    this.#labels.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.#labels.domElement);

    this.#camera.position.set(2.6, 6.4, 8.6);
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.target.set(0, 0.15, 0.15);
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.09;
    this.#controls.enablePan = false;
    this.#controls.minDistance = 6;
    this.#controls.maxDistance = 20;
    this.#controls.minPolarAngle = 0.25;
    this.#controls.maxPolarAngle = 1.32;
    this.#controls.addEventListener('change', this.#requestRender);

    this.#buildLights();
    this.#buildPlatform();
    this.#buildCpu();
    this.#buildRam();
    this.#buildGpu();
    this.#buildInterconnect();
    this.#buildPulse();

    const canvas = this.#renderer.domElement;
    canvas.addEventListener('pointerdown', this.#onPointerDown);
    canvas.addEventListener('pointerup', this.#onPointerUp);
    canvas.addEventListener('pointermove', this.#onPointerMove);

    this.#resize = new ResizeObserver(() => this.#onResize());
    this.#resize.observe(container);
    this.#onResize();
  }

  // ---------------------------------------------------------------- public

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
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(9.4, 0.24, 6.0, 4, 0.12),
      new THREE.MeshStandardMaterial({ color: COLOR.platform, roughness: 0.92, metalness: 0 }),
    );
    base.position.y = -0.12;
    base.receiveShadow = true;
    this.#scene.add(base);

    const plinth = new THREE.Mesh(
      new RoundedBoxGeometry(9.0, 0.18, 5.6, 4, 0.09),
      new THREE.MeshStandardMaterial({ color: COLOR.platformEdge, roughness: 1 }),
    );
    plinth.position.y = -0.3;
    this.#scene.add(plinth);

    // Fine engineering grid, very low contrast.
    const points: THREE.Vector3[] = [];
    for (let x = -4.5; x <= 4.51; x += 0.5) {
      points.push(new THREE.Vector3(x, 0.002, -2.75), new THREE.Vector3(x, 0.002, 2.75));
    }
    for (let z = -2.75; z <= 2.76; z += 0.5) {
      points.push(new THREE.Vector3(-4.5, 0.002, z), new THREE.Vector3(4.5, 0.002, z));
    }
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: COLOR.grid, transparent: true, opacity: 0.55 }),
    );
    this.#scene.add(grid);
  }

  #buildCpu(): void {
    const group = new THREE.Group();
    group.position.copy(CPU_POS);

    const substrate = new THREE.Mesh(
      new RoundedBoxGeometry(2.0, 0.14, 2.0, 3, 0.05),
      new THREE.MeshStandardMaterial({ color: COLOR.graphite, roughness: 0.55, metalness: 0.1 }),
    );
    substrate.position.y = 0.07;
    substrate.castShadow = true;
    substrate.receiveShadow = true;
    group.add(substrate);

    // Fine contact pads around the package edge.
    const pad = new THREE.BoxGeometry(0.06, 0.012, 0.12);
    const padMaterial = new THREE.MeshStandardMaterial({ color: COLOR.gold, roughness: 0.35, metalness: 0.8 });
    const pads = new THREE.InstancedMesh(pad, padMaterial, 4 * 13);
    const m = new THREE.Matrix4();
    let n = 0;
    for (let side = 0; side < 4; side += 1) {
      for (let i = 0; i < 13; i += 1) {
        const offset = -0.78 + i * 0.13;
        const rotation = new THREE.Matrix4().makeRotationY((side * Math.PI) / 2);
        m.makeTranslation(offset, 0.146, 0.9).premultiply(rotation);
        pads.setMatrixAt(n++, m);
      }
    }
    group.add(pads);

    // Activity ring: lights up when the core retires, halts or faults.
    this.#ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: COLOR.ringIdle,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const ringShape = new THREE.Shape();
    roundedRect(ringShape, -0.7, -0.7, 1.4, 1.4, 0.12);
    const hole = new THREE.Path();
    roundedRect(hole, -0.64, -0.64, 1.28, 1.28, 0.09);
    ringShape.holes.push(hole);
    const ring = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 6), this.#ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.143;
    group.add(ring);

    const spreader = new THREE.Mesh(
      new RoundedBoxGeometry(1.22, 0.1, 1.22, 3, 0.06),
      new THREE.MeshStandardMaterial({ color: COLOR.spreader, roughness: 0.32, metalness: 0.75 }),
    );
    spreader.position.y = 0.19;
    spreader.castShadow = true;
    group.add(spreader);

    this.#scene.add(group);
    this.#addHitTarget('cpu', new THREE.BoxGeometry(2.1, 0.5, 2.1), CPU_POS.clone().setY(0.2));
    this.#addFootprint('cpu', CPU_POS, 2.3, 2.3);
    this.#addLabel('cpu', 'CPU', 'Functional core', CPU_POS.clone().setY(0.55));
  }

  #buildRam(): void {
    const group = new THREE.Group();
    group.position.copy(RAM_POS);

    const slot = new THREE.Mesh(
      new RoundedBoxGeometry(2.7, 0.16, 0.34, 2, 0.04),
      new THREE.MeshStandardMaterial({ color: COLOR.graphite, roughness: 0.6 }),
    );
    slot.position.y = 0.08;
    slot.castShadow = true;
    group.add(slot);

    const board = new THREE.Mesh(
      new RoundedBoxGeometry(2.5, 0.66, 0.05, 2, 0.015),
      new THREE.MeshStandardMaterial({ color: COLOR.graphiteSoft, roughness: 0.5, metalness: 0.05 }),
    );
    board.position.y = 0.16 + 0.33;
    board.castShadow = true;
    group.add(board);

    const chip = new THREE.BoxGeometry(0.24, 0.3, 0.025);
    const chips = new THREE.InstancedMesh(
      chip,
      new THREE.MeshStandardMaterial({ color: COLOR.chip, roughness: 0.45 }),
      16,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < 8; i += 1) {
      const x = -1.03 + i * 0.295;
      chips.setMatrixAt(i * 2, m.makeTranslation(x, 0.53, 0.037));
      chips.setMatrixAt(i * 2 + 1, m.makeTranslation(x, 0.53, -0.037));
    }
    chips.castShadow = true;
    group.add(chips);

    const contacts = new THREE.Mesh(
      new THREE.BoxGeometry(2.36, 0.05, 0.056),
      new THREE.MeshStandardMaterial({ color: COLOR.gold, roughness: 0.3, metalness: 0.85 }),
    );
    contacts.position.y = 0.185;
    group.add(contacts);

    // Edge light: shows RAM access (fetch, load, store) reported by the core.
    this.#ramGlowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: COLOR.accent,
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.018, 0.056), this.#ramGlowMaterial);
    edge.position.y = 0.825;
    group.add(edge);

    this.#scene.add(group);
    this.#addHitTarget('ram', new THREE.BoxGeometry(2.8, 1.0, 0.7), RAM_POS.clone().setY(0.45));
    this.#addFootprint('ram', RAM_POS, 3.0, 0.9);
    this.#addLabel('ram', 'RAM', this.#options.ramLabel, RAM_POS.clone().setY(1.12));
  }

  #buildGpu(): void {
    // GPU does not exist in the simulator. It is drawn as an empty, inert
    // outline so the planned topology is visible without implying activity.
    const geometry = new RoundedBoxGeometry(2.1, 0.22, 1.6, 3, 0.06);
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
    this.#scene.add(shell);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineDashedMaterial({ color: COLOR.ghostEdge, dashSize: 0.08, gapSize: 0.06 }),
    );
    edges.computeLineDistances();
    edges.position.copy(shell.position);
    this.#scene.add(edges);

    this.#addHitTarget('gpu', new THREE.BoxGeometry(2.2, 0.5, 1.7), GPU_POS.clone().setY(0.2));
    this.#addFootprint('gpu', GPU_POS, 2.4, 1.9);
    this.#addLabel('gpu', 'GPU', 'Planned · M4', GPU_POS.clone().setY(0.55), true);
  }

  #buildInterconnect(): void {
    // CPU <-> RAM bus: three parallel lanes; the centre lane carries pulses.
    const traceMaterial = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color: COLOR.trace, roughness: 0.5, emissive: COLOR.accent, emissiveIntensity: 0 });

    for (const offset of [-0.11, 0, 0.11]) {
      const curve = busPath(-1, offset);
      const material = traceMaterial();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, offset === 0 ? 0.026 : 0.018, 8), material);
      tube.receiveShadow = true;
      this.#scene.add(tube);
      this.#ramLanes.push({ curve, material });
    }

    // CPU <-> GPU: reserved route, dashed, never animated.
    for (const offset of [-0.11, 0, 0.11]) {
      const points = busPath(1, offset).getSpacedPoints(80);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({ color: COLOR.ghostEdge, dashSize: 0.07, gapSize: 0.07 }),
      );
      line.computeLineDistances();
      this.#scene.add(line);
    }

    // Hit target along the RAM bus.
    this.#addHitTarget('interconnect', new THREE.BoxGeometry(1.4, 0.3, 0.5), new THREE.Vector3(-1.05, 0.1, 1.35));
    this.#addHitTarget('interconnect', new THREE.BoxGeometry(0.5, 0.3, 1.5), new THREE.Vector3(-0.45, 0.1, 0.5));
    const mid = this.#ramLanes[1]!.curve.getPointAt(0.5);
    this.#addLabel('interconnect', 'Interconnect', 'CPU ↔ RAM', mid.clone().add(new THREE.Vector3(0.9, 0.15, 0.25)));
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
    // Fit the platform (~9.4 units wide) at the default distance; narrower
    // (portrait) viewports zoom out further so nothing is cropped.
    this.#camera.zoom = Math.min(0.85, this.#camera.aspect / 1.6);
    this.#camera.updateProjectionMatrix();
    this.#requestRender();
  }

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

/**
 * Orthogonal bus route from a memory-side component to the CPU, with rounded
 * corners. side = -1 is RAM (left), side = 1 is the GPU placeholder (right).
 * The curve always runs from the component towards the CPU.
 */
function busPath(side: -1 | 1, offset: number): THREE.CurvePath<THREE.Vector3> {
  const startX = side * 1.5;
  // The outer lane (larger z) turns last so parallel lanes never cross.
  const cornerX = side * (0.45 - offset);
  const z0 = RAM_POS.z + offset;
  const zEnd = CPU_POS.z + 1.0;
  const r = 0.3;
  const sx = Math.sign(cornerX - startX);

  const path = new THREE.CurvePath<THREE.Vector3>();
  const a = new THREE.Vector3(startX, Y_TRACE, z0);
  const b = new THREE.Vector3(cornerX - sx * r, Y_TRACE, z0);
  const c = new THREE.Vector3(cornerX, Y_TRACE, z0);
  const d = new THREE.Vector3(cornerX, Y_TRACE, z0 - r);
  const e = new THREE.Vector3(cornerX, Y_TRACE, zEnd);
  path.add(new THREE.LineCurve3(a, b));
  path.add(new THREE.QuadraticBezierCurve3(b, c, d));
  path.add(new THREE.LineCurve3(d, e));
  return path;
}

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
