import * as THREE from 'three';
import { boxGeometry, roundedBoxGeometry } from '../primitives';
import { createVisualComponent, type MachineVisualComponent } from '../semantic';
import type { ComponentId } from '../transfers';
import { pexisMaterial } from './palette';

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
  plannedPort: 0x7d838d,
  // Graphite at partial opacity: legible as a reserved route on the satin
  // carrier and on the platform, yet clearly lighter than the observed lanes.
  plannedTrace: 0x2a2e35,
  accent: 0x2f6bff,
} as const;

const TRACE_HEIGHT = 0.056;
const LANE_OFFSETS = [-0.11, 0, 0.11] as const;

// Carrier layout (world units, Fabric root at the origin). The carrier stops
// short of the compute package instead of sliding under it, and its rails stop
// short of the lane crossings, so no Fabric geometry is buried in another
// module or pierced by a lane.
const CARRIER = { width: 1.45, back: 0, front: 1.56, height: 0.02 } as const;
const RAIL = { height: 0.022, back: 0.04, sideFront: 1.12 } as const;
// Compute ports sit under the package edge (lanes tuck under it); the visible
// endpoint land starts at the edge, this far in front of the port.
const COMPUTE_EDGE_SETBACK = 0.09;
const LAND = { along: 0.16, across: 0.3, height: 0.016 } as const;

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
  const carrierDepth = CARRIER.front - CARRIER.back;
  const carrierCenterZ = (CARRIER.front + CARRIER.back) / 2;
  const carrierTop = CARRIER.height;

  // A low satin interposer plate beneath the longitudinal sections of the
  // tracks. Light, so the Fabric frames the routes instead of becoming the
  // heaviest mass in the scene. Visual housing, not a switch or controller.
  const carrier = new THREE.Mesh(
    roundedBoxGeometry(CARRIER.width, CARRIER.height, carrierDepth, 3, 0.065),
    pexisMaterial('satin'),
  );
  carrier.name = 'fabric.carrier';
  carrier.position.set(0, CARRIER.height / 2, carrierCenterZ);
  carrier.receiveShadow = true;
  root.add(carrier);

  // Four machined rails, one draw call: two side rails, a front rail, and a
  // centre divider between the observed corridor (x < 0) and the planned one
  // (x > 0). They sit on the carrier and end before any lane crosses them.
  const rails = new THREE.InstancedMesh(boxGeometry(1, 1, 1), pexisMaterial('rail'), 4);
  rails.name = 'fabric.frame-rails';
  const railY = carrierTop + RAIL.height / 2;
  const sideDepth = RAIL.sideFront - RAIL.back;
  const sideZ = (RAIL.sideFront + RAIL.back) / 2;
  const sideX = CARRIER.width / 2 - 0.035;
  for (const [i, spec] of [
    { x: -sideX, z: sideZ, width: 0.035, depth: sideDepth },
    { x: sideX, z: sideZ, width: 0.035, depth: sideDepth },
    { x: 0, z: CARRIER.front - 0.035, width: CARRIER.width - 0.15, depth: 0.035 },
    { x: 0, z: sideZ, width: 0.03, depth: sideDepth },
  ].entries()) {
    rails.setMatrixAt(i, new THREE.Matrix4().compose(
      new THREE.Vector3(spec.x, railY, spec.z),
      new THREE.Quaternion(),
      new THREE.Vector3(spec.width, RAIL.height, spec.depth),
    ));
  }
  rails.instanceMatrix.needsUpdate = true;
  root.add(rails);

  // Nickel endpoint lands where the observed lanes leave each module: beside
  // the memory mount and in front of the compute package, both visible.
  const landY = LAND.height / 2;
  const activePorts = new THREE.InstancedMesh(
    boxGeometry(1, LAND.height, 1),
    pexisMaterial('nickel'),
    2,
  );
  activePorts.name = 'fabric.active-endpoints';
  activePorts.setMatrixAt(0, new THREE.Matrix4().compose(
    new THREE.Vector3(ports.memory.x + LAND.along / 2, landY, ports.memory.z),
    new THREE.Quaternion(),
    new THREE.Vector3(LAND.along, 1, LAND.across),
  ));
  activePorts.setMatrixAt(1, new THREE.Matrix4().compose(
    new THREE.Vector3(ports.compute.x, landY, ports.compute.z + COMPUTE_EDGE_SETBACK + LAND.along / 2),
    new THREE.Quaternion(),
    new THREE.Vector3(LAND.across, 1, LAND.along),
  ));
  activePorts.instanceMatrix.needsUpdate = true;
  root.add(activePorts);

  const plannedPort = new THREE.Mesh(
    boxGeometry(LAND.along, LAND.height, LAND.across),
    new THREE.MeshStandardMaterial({
      color: COLOR.plannedPort,
      roughness: 0.65,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  plannedPort.name = 'fabric.graphics-reserved-port';
  plannedPort.position.set(ports.graphicsReserved.x, landY, ports.graphicsReserved.z);
  root.add(plannedPort);

  // The Pexis identity: the 2×2 brand mark, engraved in graphite between the
  // two route corners. A fabrication mark, not a powered controller.
  const mark = new THREE.InstancedMesh(roundedBoxGeometry(0.07, 0.01, 0.07, 2, 0.012), pexisMaterial('graphite'), 4);
  mark.name = 'fabric.identity-mark';
  for (let i = 0; i < 4; i += 1) {
    const x = (i % 2 === 0 ? -1 : 1) * 0.05;
    const z = CARRIER.front - 0.26 + (i < 2 ? -1 : 1) * 0.05;
    mark.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, carrierTop + 0.005, z));
  }
  mark.instanceMatrix.needsUpdate = true;
  root.add(mark);

  const activeLanes: FabricLane[] = [];
  const activeMeshes: THREE.Mesh[] = [];
  for (const offset of LANE_OFFSETS) {
    const curve = makeOrthogonalLink(ports.memory, ports.compute, -1, offset);
    // Graphite traces: crisp against the satin carrier and the platform, and
    // the only Fabric surface that real CPU/RAM events may light up.
    const material = pexisMaterial('graphiteSoft', { emissive: COLOR.accent, emissiveIntensity: 0 });
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
        opacity: 0.42,
      }),
    );
    line.name = 'fabric.graphics-planned';
    line.computeLineDistances();
    root.add(line);
    plannedPaths.push(path);
    plannedMeshes.push(line);
  }

  const carrierAnchor = anchor('anchor.fabric-center', 0, 0.08, carrierCenterZ);
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
