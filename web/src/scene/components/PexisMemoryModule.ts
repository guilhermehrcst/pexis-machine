import * as THREE from 'three';
import { boxGeometry, roundedBoxGeometry } from '../primitives';
import { createVisualComponent, type MachineVisualComponent } from '../semantic';
import type { ComponentId } from '../transfers';
import { pexisMaterial } from './palette';

// Same surface vocabulary as Pexis Compute (shared palette). Blue is used
// only to display real memory events supplied by the C++ simulator.
const COLOR = {
  routing: 0x727d8b,
  activity: 0x606875,
  accent: 0x2f6bff,
} as const;

export interface PexisMemoryModuleBuild {
  readonly component: MachineVisualComponent<ComponentId>;
  readonly activityMaterial: THREE.MeshStandardMaterial;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/**
 * Pexis memory cartridge, modeled entirely with procedural geometry.
 *
 * Packages, contacts, and routing are illustrative industrial details:
 * they do not represent simulated memory channels, DRAM banks, bandwidth,
 * physical timing, or memory hierarchy. The C++ core remains the sole truth.
 */
export function buildPexisMemoryModule(): PexisMemoryModuleBuild {
  const root = new THREE.Group();
  root.name = 'PexisMemoryModule';

  const mount = new THREE.Mesh(
    roundedBoxGeometry(2.72, 0.15, 0.42, 3, 0.044),
    pexisMaterial('graphite'),
  );
  mount.name = 'memory.mount';
  mount.position.y = 0.075;
  mount.castShadow = true;
  mount.receiveShadow = true;
  root.add(mount);

  const pcb = new THREE.Mesh(
    roundedBoxGeometry(2.48, 0.78, 0.07, 3, 0.018),
    pexisMaterial('graphiteSoft'),
  );
  pcb.name = 'memory.carrier';
  pcb.position.y = 0.535;
  pcb.castShadow = true;
  root.add(pcb);

  // Two faces, eight illustrative package shapes each. One draw call.
  const packages = new THREE.InstancedMesh(
    roundedBoxGeometry(0.23, 0.355, 0.04, 2, 0.014),
    pexisMaterial('silicon'),
    16,
  );
  packages.name = 'memory.packages';
  packages.castShadow = true;
  const matrix = new THREE.Matrix4();
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < 8; i += 1) {
      const x = -1.025 + i * (2.05 / 7);
      packages.setMatrixAt(side * 8 + i, matrix.makeTranslation(x, 0.63, side === 0 ? 0.063 : -0.063));
    }
  }
  packages.instanceMatrix.needsUpdate = true;
  root.add(packages);

  // Nickel connector fingers on both faces. These are not separate
  // simulator-visible memory ports or channels.
  const contacts = new THREE.InstancedMesh(
    boxGeometry(0.058, 0.105, 0.014),
    pexisMaterial('nickel'),
    48,
  );
  contacts.name = 'memory.contacts';
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < 24; i += 1) {
      const x = -1.1 + i * (2.2 / 23);
      contacts.setMatrixAt(side * 24 + i, matrix.makeTranslation(x, 0.235, side === 0 ? 0.047 : -0.047));
    }
  }
  contacts.instanceMatrix.needsUpdate = true;
  root.add(contacts);

  const cap = new THREE.Mesh(
    roundedBoxGeometry(2.62, 0.102, 0.14, 3, 0.036),
    pexisMaterial('satin'),
  );
  cap.name = 'memory.chassis-cap';
  cap.position.y = 0.953;
  cap.castShadow = true;
  root.add(cap);

  // Four restrained protective rails, instanced in one draw call.
  const rails = new THREE.InstancedMesh(
    boxGeometry(1, 1, 1),
    pexisMaterial('rail'),
    4,
  );
  rails.name = 'memory.chassis-rails';
  let index = 0;
  for (const x of [-1.245, 1.245]) {
    for (const z of [-0.045, 0.045]) {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(x, 0.56, z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.05, 0.675, 0.059),
      );
      rails.setMatrixAt(index++, transform);
    }
  }
  rails.instanceMatrix.needsUpdate = true;
  rails.castShadow = true;
  root.add(rails);

  // Inert surface detailing. It must never animate as fake data movement.
  const routing = new THREE.InstancedMesh(
    boxGeometry(0.018, 0.115, 0.009),
    new THREE.MeshStandardMaterial({ color: COLOR.routing, roughness: 0.57, metalness: 0.45 }),
    16,
  );
  routing.name = 'memory.surface-routing';
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < 8; i += 1) {
      const x = -1.025 + i * (2.05 / 7);
      routing.setMatrixAt(side * 8 + i, matrix.makeTranslation(x, 0.355, side === 0 ? 0.048 : -0.048));
    }
  }
  routing.instanceMatrix.needsUpdate = true;
  root.add(routing);

  const activityMaterial = new THREE.MeshStandardMaterial({
    color: COLOR.activity,
    emissive: COLOR.accent,
    emissiveIntensity: 0,
    roughness: 0.46,
    metalness: 0.15,
  });
  const activityEdge = new THREE.Mesh(boxGeometry(2.23, 0.018, 0.016), activityMaterial);
  activityEdge.name = 'memory.activity-edge';
  activityEdge.position.set(0, 0.988, 0.083);
  root.add(activityEdge);

  // Semantic anchors exist for inspection and future Fabric geometry only.
  const fabricAnchor = anchor('anchor.fabric-port', 1.36, 0.035, 0);
  const carrierAnchor = anchor('anchor.memory-carrier', 0, 0.54, 0.037);
  const packagesAnchor = anchor('anchor.memory-packages', 0, 0.63, 0.085);
  const contactsAnchor = anchor('anchor.memory-contacts', 0, 0.235, 0.056);
  const chassisAnchor = anchor('anchor.memory-chassis', 1.25, 0.96, 0.08);
  root.add(fabricAnchor, carrierAnchor, packagesAnchor, contactsAnchor, chassisAnchor);

  const component = createVisualComponent<ComponentId>({
    id: 'ram',
    kind: 'memory',
    root,
    parts: [
      { id: 'slot', role: 'physical-mount', objects: [mount], anchor: fabricAnchor },
      { id: 'pcb', role: 'memory-carrier', objects: [pcb], anchor: carrierAnchor },
      { id: 'dram-packages', role: 'illustrative-memory-packages', objects: [packages], anchor: packagesAnchor },
      { id: 'contacts', role: 'illustrative-connector', objects: [contacts], anchor: contactsAnchor },
      { id: 'chassis', role: 'industrial-frame', objects: [cap, rails], anchor: chassisAnchor },
      { id: 'routing', role: 'inert-surface-detail', objects: [routing] },
      { id: 'activity-edge', role: 'observation-memory-access', objects: [activityEdge] },
    ],
  });

  return { component, activityMaterial, width: 2.72, height: 1.015, depth: 0.42 };
}

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const point = new THREE.Object3D();
  point.name = name;
  point.position.set(x, y, z);
  return point;
}
