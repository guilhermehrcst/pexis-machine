import * as THREE from 'three';
import { boxGeometry, roundedBoxGeometry } from '../primitives';
import { createVisualComponent, type MachineVisualComponent } from '../semantic';
import type { ComponentId } from '../transfers';

/**
 * The current core reports only CPU <-> RAM fetch/load/store events. No
 * interconnect latency, switching fabric, GPU traffic, or physical bandwidth
 * is simulated. This is a VISUAL topology, not a machine-topology API.
 */
export type FabricLinkState = 'event-backed' | 'planned';

export interface FabricVisualLink {
  readonly id: string;
  readonly from: 'ram' | 'gpu';
  readonly to: 'cpu';
  readonly state: FabricLinkState;
}

export const FABRIC_VISUAL_LINKS: readonly FabricVisualLink[] = Object.freeze([
  Object.freeze({ id: 'memory-compute', from: 'ram', to: 'cpu', state: 'event-backed' }),
  Object.freeze({ id: 'graphics-reserved', from: 'gpu', to: 'cpu', state: 'planned' }),
]);

/** World-space endpoints. Planned graphics endpoints are merely a visual stub. */
export interface PexisFabricPorts {
  readonly memory: THREE.Vector3;
  readonly compute: THREE.Vector3;
  readonly graphicsReserved: THREE.Vector3;
  readonly computeReserved: THREE.Vector3;
}

export interface FabricLane {
  readonly curve: THREE.CurvePath<THREE.Vector3>;
  readonly material: THREE.MeshStandardMaterial;
}

export interface PexisFabricBuild {
  readonly component: MachineVisualComponent<ComponentId>;
  /** The ONLY lanes that the simulator's real CPU/RAM events may illuminate. */
  readonly activeLanes: readonly FabricLane[];
  readonly transferPath: THREE.CurvePath<THREE.Vector3>;
  /** Never used for movement or activity; only the reserved diagram. */
  readonly plannedPaths: readonly THREE.CurvePath<THREE.Vector3>[];
}

const COLOR = {
  carrier: 0x303843,
  rail: 0x858b95,
  land: 0xa4a9b1,
  seal: 0xb8bdc5,
  activeTrace: 0xbcbfc6,
  plannedTrace: 0xa9adb4,
  accent: 0x2f6bff,
} as const;

const TRACE_HEIGHT = 0.056;
const LANE_OFFSETS = [-0.11, 0, 0.11] as const;

/**
 * Procedural Pexis Fabric carrier and its honest connection diagram.
 *
 * Materials and geometry are presentation-only. The Web Lab's existing
 * MachineScene is still responsible for translating C++ machine events into
 * flashes and for moving the one observable RAM <-> CPU pulse.
 */
export function buildPexisFabric(ports: PexisFabricPorts): PexisFabricBuild {
  for (const [name, point] of Object.entries(ports)) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      throw new RangeError('Invalid Fabric endpoint: ' + name);
    }
  }
  if (
    ports.memory.x >= ports.compute.x - 0.6 ||
    ports.graphicsReserved.x <= ports.computeReserved.x + 0.6 ||
    ports.memory.z <= ports.compute.z + 0.6 ||
    ports.graphicsReserved.z <= ports.computeReserved.z + 0.6
  ) {
    throw new RangeError('Pexis Fabric endpoints must form two distinct, forward-facing routes');
  }

  const root = new THREE.Group();
  root.name = 'PexisFabric';

  // A low interposer plate beneath the longitudinal sections of the tracks.
  // It is visual housing, not a simulated switch or memory controller.
  const carrier = new THREE.Mesh(
    roundedBoxGeometry(1.45, 0.02, 1.76, 3, 0.065),
    new THREE.MeshStandardMaterial({
      color: COLOR.carrier,
      roughness: 0.58,
      metalness: 0.22,
    }),
  );
  carrier.name = 'fabric.carrier';
  carrier.position.set(0, 0.01, 0.66);
  carrier.receiveShadow = true;
  root.add(carrier);

  // Four machined boundary rails are a single draw call.
  const rails = new THREE.InstancedMesh(
    boxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: COLOR.rail,
      roughness: 0.46,
      metalness: 0.48,
    }),
    4,
  );
  rails.name = 'fabric.frame-rails';
  for (const [i, spec] of [
    { x: -0.69, z: 0.66, width: 0.035, depth: 1.55 },
    { x: 0.69, z: 0.66, width: 0.035, depth: 1.55 },
    { x: 0, z: -0.19, width: 1.28, depth: 0.04 },
    { x: 0, z: 1.51, width: 1.28, depth: 0.04 },
  ].entries()) {
    rails.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(spec.x, 0.043, spec.z),
      new THREE.Quaternion(),
      new THREE.Vector3(spec.width, 0.025, spec.depth),
    ));
  }
  rails.instanceMatrix.needsUpdate = true;
  root.add(rails);

  const activePorts = new THREE.InstancedMesh(
    boxGeometry(0.23, 0.021, 0.19),
    new THREE.MeshStandardMaterial({ color: COLOR.land, roughness: 0.46, metalness: 0.5 }),
    2,
  );
  activePorts.name = 'fabric.active-endpoints';
  for (const [i, port] of [ports.memory, ports.compute].entries()) {
    activePorts.setMatrixAt(i, new THREE.Matrix4().makeTranslation(port.x, 0.021, port.z));
  }
  activePorts.instanceMatrix.needsUpdate = true;
  root.add(activePorts);

  const plannedPort = new THREE.Mesh(
    boxGeometry(0.23, 0.021, 0.19),
    new THREE.MeshStandardMaterial({
      color: COLOR.plannedTrace,
      roughness: 0.65,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  plannedPort.name = 'fabric.graphics-reserved-port';
  plannedPort.position.set(ports.graphicsReserved.x, 0.021, ports.graphicsReserved.z);
  root.add(plannedPort);

  // A restrained fabrication mark, not a powered controller.
  const mark = new THREE.Mesh(
    roundedBoxGeometry(0.2, 0.015, 0.2, 2, 0.025),
    new THREE.MeshStandardMaterial({
      color: COLOR.seal,
      roughness: 0.48,
      metalness: 0.48,
    }),
  );
  mark.name = 'fabric.identity-mark';
  mark.position.set(0, 0.038, 0.68);
  root.add(mark);

  const activeLanes: FabricLane[] = [];
  const activeMeshes: THREE.Mesh[] = [];
  for (const offset of LANE_OFFSETS) {
    const curve = makeOrthogonalLink(ports.memory, ports.compute, -1, offset);
    const material = new THREE.MeshStandardMaterial({
      color: COLOR.activeTrace,
      roughness: 0.47,
      metalness: 0.3,
      emissive: COLOR.accent,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 96, offset === 0 ? 0.026 : 0.018, 8),
      material,
    );
    mesh.name = offset === 0 ? 'fabric.memory-primary' : 'fabric.memory-parallel';
    mesh.receiveShadow = true;
    root.add(mesh);
    activeLanes.push({ curve, material });
    activeMeshes.push(mesh);
  }

  const plannedPaths: THREE.CurvePath<THREE.Vector3>[] = [];
  const plannedMeshes: THREE.Line[] = [];
  for (const offset of LANE_OFFSETS) {
    const path = makeOrthogonalLink(ports.graphicsReserved, ports.computeReserved, 1, offset);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(path.getSpacedPoints(80)),
      new THREE.LineDashedMaterial({
        color: COLOR.plannedTrace,
        dashSize: 0.07,
        gapSize: 0.07,
        transparent: true,
        opacity: 0.56,
      }),
    );
    line.name = 'fabric.graphics-planned';
    line.computeLineDistances();
    root.add(line);
    plannedPaths.push(path);
    plannedMeshes.push(line);
  }

  const carrierAnchor = anchor('anchor.fabric-center', 0, 0.08, 0.66);
  const memoryAnchor = anchor('anchor.fabric-memory', ports.memory.x, TRACE_HEIGHT, ports.memory.z);
  const graphicsAnchor = anchor(
    'anchor.fabric-graphics-reserved', ports.graphicsReserved.x, TRACE_HEIGHT, ports.graphicsReserved.z,
  );
  const transferAnchor = anchor('anchor.fabric-active-route', -0.45, 0.10, 0.70);
  const plannedAnchor = anchor('anchor.fabric-planned-route', 0.45, 0.10, 0.70);
  root.add(carrierAnchor, memoryAnchor, graphicsAnchor, transferAnchor, plannedAnchor);

  const component = createVisualComponent<ComponentId>({
    id: 'interconnect',
    kind: 'fabric',
    root,
    parts: [
      { id: 'carrier', role: 'passive-interposer', objects: [carrier], anchor: carrierAnchor },
      { id: 'frame', role: 'mechanical-frame', objects: [rails] },
      { id: 'active-ports', role: 'observed-cpu-memory-endpoints', objects: [activePorts], anchor: memoryAnchor },
      { id: 'graphics-reserved-port', role: 'planned-only-endpoint', objects: [plannedPort], anchor: graphicsAnchor },
      { id: 'fabric-mark', role: 'identity-only-detail', objects: [mark] },
      { id: 'ram-lanes', role: 'event-backed-cpu-memory-link', objects: activeMeshes, anchor: transferAnchor },
      { id: 'gpu-reserved-lanes', role: 'planned-not-simulated-link', objects: plannedMeshes, anchor: plannedAnchor },
    ],
  });

  return {
    component,
    activeLanes,
    transferPath: activeLanes[1]!.curve,
    plannedPaths,
  };
}

function makeOrthogonalLink(
  start: THREE.Vector3,
  end: THREE.Vector3,
  side: -1 | 1,
  offset: number,
): THREE.CurvePath<THREE.Vector3> {
  // Preserve the M1 CPU/RAM bus routing: horizontal approach, quadratic
  // corner, then longitudinal route. Side changes orientation only.
  const cornerX = end.x - side * offset;
  const startZ = start.z + offset;
  const radius = Math.min(0.3, Math.abs(cornerX - start.x) / 3, Math.abs(startZ - end.z) / 3);
  const horizontal = Math.sign(cornerX - start.x);
  const a = new THREE.Vector3(start.x, TRACE_HEIGHT, startZ);
  const b = new THREE.Vector3(cornerX - horizontal * radius, TRACE_HEIGHT, startZ);
  const c = new THREE.Vector3(cornerX, TRACE_HEIGHT, startZ);
  const d = new THREE.Vector3(cornerX, TRACE_HEIGHT, startZ - radius);
  const e = new THREE.Vector3(cornerX, TRACE_HEIGHT, end.z);
  const path = new THREE.CurvePath<THREE.Vector3>();
  path.add(new THREE.LineCurve3(a, b));
  path.add(new THREE.QuadraticBezierCurve3(b, c, d));
  path.add(new THREE.LineCurve3(d, e));
  return path;
}

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const point = new THREE.Object3D();
  point.name = name;
  point.position.set(x, y, z);
  return point;
}
