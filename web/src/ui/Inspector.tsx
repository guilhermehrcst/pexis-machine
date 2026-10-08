import { Cross2Icon } from '@radix-ui/react-icons';
import { STATUS_LABEL, byteCount, bytesHuman, decimal, hexAddress } from '../machine/format';
import type { LabReady } from '../machine/useMachineLab';
import type { ComponentId } from '../scene/transfers';

const COMPONENTS: ReadonlyArray<{ id: ComponentId; label: string }> = [
  { id: 'cpu', label: 'CPU' },
  { id: 'ram', label: 'RAM' },
  { id: 'interconnect', label: 'Interconnect' },
  { id: 'gpu', label: 'GPU' },
];

interface InspectorProps {
  readonly lab: LabReady;
  readonly selected: ComponentId | null;
  readonly onSelect: (id: ComponentId | null) => void;
  readonly width: number;
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="inspector__row">
      <dt>{label}</dt>
      <dd className="mono">{value}</dd>
    </div>
  );
}

export function Inspector({ lab, selected, onSelect, width }: InspectorProps) {
  const { snapshot, client } = lab;
  const t = snapshot.telemetry;

  return (
    <div className="inspector">
      <div className="segmented" role="group" aria-label="Inspect component">
        {COMPONENTS.map((component) => (
          <button
            key={component.id}
            type="button"
            className={selected === component.id ? 'segmented__item is-active' : 'segmented__item'}
            aria-pressed={selected === component.id}
            onClick={() => onSelect(selected === component.id ? null : component.id)}
          >
            {component.label}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="inspector__card" aria-live="polite">
          <div className="inspector__head">
            <h3>{COMPONENTS.find((c) => c.id === selected)?.label}</h3>
            <button type="button" className="icon-button icon-button--small" onClick={() => onSelect(null)} aria-label="Close inspector">
              <Cross2Icon aria-hidden="true" />
            </button>
          </div>
          {selected === 'cpu' ? (
            <dl>
              <Row label="Module" value="Pexis Compute" />
              <Row label="Model" value="Functional, in-order" />
              <Row label="Status" value={STATUS_LABEL[snapshot.status]} />
              <Row label="PC" value={hexAddress(snapshot.pc, width)} />
              <Row label="Registers" value="8 × 64-bit" />
              <Row label="Retired" value={decimal(t.instructionsRetired)} />
              <Row label="Cycles (abstract)" value={decimal(t.cycles)} />
            </dl>
          ) : null}
          {selected === 'ram' ? (
            <dl>
              <Row label="Size" value={bytesHuman(client.memorySize)} />
              <Row label="Layout" value="Linear, byte-addressable" />
              <Row label="Loads / stores" value={`${decimal(t.loads)} / ${decimal(t.stores)}`} />
              <Row label="Instruction bytes" value={byteCount(t.instructionBytes)} />
              <Row label="Data read" value={byteCount(t.dataBytesRead)} />
              <Row label="Data written" value={byteCount(t.dataBytesWritten)} />
            </dl>
          ) : null}
          {selected === 'interconnect' ? (
            <dl>
              <Row label="Route" value="CPU ↔ RAM" />
              <Row label="Bytes moved" value={byteCount(t.bytesMoved)} />
              <Row label="Timing" value="Not modeled in M1" />
            </dl>
          ) : null}
          {selected === 'gpu' ? (
            <p className="inspector__planned">
              Planned for <strong>M4 · Heterogeneous Machine</strong>. The GPU is not simulated: it has no state,
              no metrics and no activity.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
