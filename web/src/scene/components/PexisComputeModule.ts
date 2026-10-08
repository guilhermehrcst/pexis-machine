import * as THREE from 'three';
import { boxGeometry, roundedBoxGeometry } from '../primitives';
import { createVisualComponent, type MachineVisualComponent } from '../semantic';
import type { ComponentId } from '../transfers';

// Pexis hardware palette: graphite structure, satin metal, a quiet silicon
// surface and nickel contacts. Saturated colour is reserved for real
// activity (the ring is driven by simulator events, see MachineScene).
const COLOR = {
  substrate: 0x262a31,
  carrier: 0xb8bdc5,
  carrierRail: 0x7d838d,
  silicon: 0x222935,
  contact: 0x9ea3ab,
  activityIdle: 0x8f96a3,
  activityBase: 0x5d636d,
} as const;

export interface PexisComputeModuleBuild {
  readonly component: MachineVisualComponent<ComponentId>;
  readonly activityMaterial: THREE.MeshStandardMaterial;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/**
 * Authorial Pexis compute package for M1B.
 *
 * It is intentionally a visual package, not a model of CPU internals. The
 * simulator remains the sole owner of execution, registers, timing, and
 * architectural behavior.
 */
export function buildPexisComputeModule(): PexisComputeModuleBuild {
  const root = new THREE.Group();
  root.name = 'PexisComputeModule';

  const substrate = new THREE.Mesh(
    roundedBoxGeometry(2.18, 0.16, 2.18, 4, 0.075),
    new THREE.MeshStandardMaterial({
      color: COLOR.substrate,
      roughness: 0.48,
      metalness: 0.16,
    }),
  );
  substrate.name = 'compute.substrate';
  substrate.position.y = 0.08;
  substrate.castShadow = true;
  substrate.receiveShadow = true;
  root.add(substrate);

  const contactGeometry = boxGeometry(0.064, 0.014, 0.125);
  const contacts = new THREE.InstancedMesh(
    contactGeometry,
    new THREE.MeshStandardMaterial({
      color: COLOR.contact,
      roughness: 0.38,
      metalness: 0.7,
    }),
    64,
  );
  contacts.name = 'compute.contacts';
  contacts.castShadow = true;

  const matrix = new THREE.Matrix4();
  let instance = 0;
  for (let i = 0; i < 16; i += 1) {
    const offset = -0.84 + i * 0.112;
    matrix.makeRotationY(0);
    matrix.setPosition(offset, 0.169, 0.985);
    contacts.setMatrixAt(instance++, matrix);
    matrix.makeRotationY(Math.PI);
    matrix.setPosition(-offset, 0.169, -0.985);
    contacts.setMatrixAt(instance++, matrix);
    matrix.makeRotationY(Math.PI / 2);
    matrix.setPosition(0.985, 0.169, -offset);
    contacts.setMatrixAt(instance++, matrix);
    matrix.makeRotationY(-Math.PI / 2);
    matrix.setPosition(-0.985, 0.169, offset);
    contacts.setMatrixAt(instance++, matrix);
  }
  contacts.instanceMatrix.needsUpdate = true;
  root.add(contacts);

  const carrier = new THREE.Mesh(
    roundedBoxGeometry(1.72, 0.13, 1.72, 4, 0.075),
    new THREE.MeshStandardMaterial({
      // Satin, not mirror: the scene has no environment map, so high
      // metalness renders as dark banding instead of brushed metal.
      color: COLOR.carrier,
      roughness: 0.46,
      metalness: 0.55,
    }),
  );
  carrier.name = 'compute.carrier';
  carrier.position.y = 0.225;
  carrier.castShadow = true;
  root.add(carrier);

  const computeTile = new THREE.Mesh(
    roundedBoxGeometry(1.18, 0.055, 1.18, 3, 0.035),
    new THREE.MeshStandardMaterial({
      color: COLOR.silicon,
      roughness: 0.4,
      metalness: 0.22,
    }),
  );
  computeTile.name = 'compute.tile';
  computeTile.position.y = 0.318;
  computeTile.castShadow = true;
  root.add(computeTile);

  // Four machined rails frame the package without adding four draw calls.
  const railGeometry = boxGeometry(1, 1, 1);
  const rails = new THREE.InstancedMesh(
    railGeometry,
    new THREE.MeshStandardMaterial({
      color: COLOR.carrierRail,
      roughness: 0.42,
      metalness: 0.5,
    }),
    4,
  );
  rails.name = 'compute.frame-rails';
  setBoxInstance(rails, 0, new THREE.Vector3(-0.715, 0.325, 0), new THREE.Vector3(0.045, 0.026, 1.25));
  setBoxInstance(rails, 1, new THREE.Vector3(0.715, 0.325, 0), new THREE.Vector3(0.045, 0.026, 1.25));
  setBoxInstance(rails, 2, new THREE.Vector3(0, 0.325, -0.715), new THREE.Vector3(1.25, 0.026, 0.045));
  setBoxInstance(rails, 3, new THREE.Vector3(0, 0.325, 0.715), new THREE.Vector3(1.25, 0.026, 0.045));
  rails.instanceMatrix.needsUpdate = true;
  rails.castShadow = true;
  root.add(rails);

  const activityMaterial = new THREE.MeshStandardMaterial({
    // A quiet graphite line at rest; emissive colour (set by MachineScene from
    // real machine state) is what makes it read.
    color: COLOR.activityBase,
    emissive: COLOR.activityIdle,
    emissiveIntensity: 0.25,
    roughness: 0.36,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const activityRing = new THREE.Mesh(rectangularRingGeometry(1.38, 1.38, 1.29, 1.29, 0.095), activityMaterial);
  activityRing.name = 'compute.activity-ring';
  activityRing.rotation.x = -Math.PI / 2;
  activityRing.position.y = 0.349;
  root.add(activityRing);

  const packageAnchor = anchor('anchor.package', 0, 0.19, 0);
  const contactsAnchor = anchor('anchor.contacts', 0, 0.17, 0.98);
  const tileAnchor = anchor('anchor.compute-tile', 0, 0.38, 0);
  const frameAnchor = anchor('anchor.module-frame', 0.71, 0.36, 0);
  root.add(packageAnchor, contactsAnchor, tileAnchor, frameAnchor);

  const component = createVisualComponent<ComponentId>({
    id: 'cpu',
    kind: 'compute',
    root,
    parts: [
      {
        id: 'package',
        role: 'compute-package',
        objects: [substrate],
        anchor: packageAnchor,
      },
      {
        id: 'contacts',
        role: 'electrical-contacts',
        objects: [contacts],
        anchor: contactsAnchor,
      },
      {
        id: 'module-frame',
        role: 'industrial-frame',
        objects: [carrier, rails],
        anchor: frameAnchor,
      },
      {
        id: 'compute-tile',
        role: 'physical-compute-surface',
        objects: [computeTile],
        anchor: tileAnchor,
      },
      {
        id: 'activity-ring',
        role: 'observation-activity',
        objects: [activityRing],
      },
    ],
  });

  return {
    component,
    activityMaterial,
    width: 2.18,
    height: 0.38,
    depth: 2.18,
  };
}

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const point = new THREE.Object3D();
  point.name = name;
  point.position.set(x, y, z);
  return point;
}

function setBoxInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3,
  scale: THREE.Vector3,
): void {
  const matrix = new THREE.Matrix4();
  matrix.compose(position, new THREE.Quaternion(), scale);
  mesh.setMatrixAt(index, matrix);
}

function rectangularRingGeometry(
  outerWidth: number,
  outerDepth: number,
  innerWidth: number,
  innerDepth: number,
  radius: number,
): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  roundedRect(shape, -outerWidth / 2, -outerDepth / 2, outerWidth, outerDepth, radius);

  const hole = new THREE.Path();
  roundedRect(
    hole,
    -innerWidth / 2,
    -innerDepth / 2,
    innerWidth,
    innerDepth,
    Math.max(0.01, radius - 0.02),
  );
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 8);
}

function roundedRect(
  shape: THREE.Shape | THREE.Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
}
