import { Cross2Icon } from '@radix-ui/react-icons';
import { STATUS_LABEL, byteCount, bytesHuman, decimal, hexAddress } from '../machine/format';
import type { LabReady } from '../machine/useMachineLab';
import { REPRESENTATION_LABEL, type ComponentInspection } from '../scene/inspection';
import { inspectionFor } from '../scene/inspections';
import type { ComponentId } from '../scene/transfers';
import type { InspectionState } from './inspectionState';

const COMPONENTS: ReadonlyArray<{ id: ComponentId; label: string }> = [
  { id: 'cpu', label: 'CPU' },
  { id: 'ram', label: 'RAM' },
  { id: 'interconnect', label: 'Fabric' },
  { id: 'gpu', label: 'GPU' },
];

interface InspectorProps {
  readonly lab: LabReady;
  readonly selected: ComponentId | null;
  readonly onSelect: (id: ComponentId | null) => void;
  readonly inspection: InspectionState | null;
  readonly onInspect: (update: (current: InspectionState | null) => InspectionState | null) => void;
  /** Where the part inspector goes: over the stage (wide) or below it (narrow, rendered by the caller). */
  readonly partsLayout: 'overlay' | 'below';
  readonly width: number;
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="inspector__row">
      <dt>{label}</dt>
      <dd className="mono" translate="no">
        {value}
      </dd>
    </div>
  );
}

export function Inspector({ lab, selected, onSelect, inspection, onInspect, partsLayout, width }: InspectorProps) {
  const { snapshot, client } = lab;
  const t = snapshot.telemetry;
  const inspectable = inspectionFor(selected);
  const active = inspection !== null && inspectable !== null && inspection.component === inspectable.componentId;

  return (
    <div className="inspector">
      <div className="segmented" role="group" aria-label="Inspect component" translate="no">
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

      {active ? (
        <>
          {partsLayout === 'overlay' ? (
            <PartInspector inspectable={inspectable} inspection={inspection} onInspect={onInspect} />
          ) : null}
          <ExplodeBar inspection={inspection} onInspect={onInspect} />
        </>
      ) : selected ? (
        <div className="inspector__card" aria-live="polite">
          <div className="inspector__head">
            <h3 translate="no">{COMPONENTS.find((c) => c.id === selected)?.label}</h3>
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
          {inspectable ? (
            <button
              type="button"
              className="button button--small inspector__inspect"
              onClick={() => onInspect(() => ({ component: inspectable.componentId, part: null, amount: 1, animate: true }))}
            >
              Inspect parts
            </button>
          ) : null}
          {selected === 'ram' ? (
            <dl>
              <Row label="Module" value="Pexis Memory" />
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
              <Row label="Module" value="Pexis Fabric" />
              <Row label="Observed route" value="CPU ↔ RAM" />
              <Row label="Reserved" value="GPU · M4" />
              <Row label="Core bytes moved" value={byteCount(t.bytesMoved)} />
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

export interface PartInspectorProps {
  readonly inspectable: ComponentInspection;
  readonly inspection: InspectionState;
  readonly onInspect: InspectorProps['onInspect'];
}

/**
 * Inspector of one part of an exploded component. Every statement comes from
 * the component's inspection record; it says what the geometry is and what the
 * core really simulates, and never attributes capabilities the core lacks.
 */
export function PartInspector({ inspectable, inspection, onInspect }: PartInspectorProps) {
  const partId = inspection.part;
  const info = partId === null ? undefined : inspectable.parts[partId];
  const pick = (part: string | null) => onInspect((current) => (current ? { ...current, part } : current));
  return (
    <div className="inspector__card inspector__card--parts" aria-live="polite">
      <div className="inspector__head">
        <h3 translate="no">{inspectable.title} · parts</h3>
        <button type="button" className="icon-button icon-button--small" onClick={() => onInspect(() => null)} aria-label="Close exploded view">
          <Cross2Icon aria-hidden="true" />
        </button>
      </div>
      <div className="part-list" role="group" aria-label="Parts" translate="no">
        {inspectable.plan.steps.map(({ partId: id }) => (
          <button
            key={id}
            type="button"
            className={id === partId ? 'part-chip is-active' : 'part-chip'}
            aria-pressed={id === partId}
            onClick={() => pick(id === partId ? null : id)}
          >
            {inspectable.parts[id]!.title}
          </button>
        ))}
      </div>
      {info && partId !== null ? (
        <>
          <dl>
            <Row label="Part" value={`${inspectable.componentId}/${partId}`} />
            <Row label="Role" value={info.role} />
          </dl>
          <p className={`part-nature part-nature--${info.representation}`}>{REPRESENTATION_LABEL[info.representation]}</p>
          <p className="part-text">{info.summary}</p>
          <p className="part-text part-text--muted">{info.relation}</p>
        </>
      ) : (
        <p className="part-text part-text--muted">Tap a part, or choose one above.</p>
      )}
      <p className="part-text part-text--simulated">{inspectable.simulated}</p>
    </div>
  );
}

function ExplodeBar({ inspection, onInspect }: { readonly inspection: InspectionState; readonly onInspect: InspectorProps['onInspect'] }) {
  const percent = Math.round(inspection.amount * 100);
  const exploded = inspection.amount >= 0.5;
  const set = (amount: number, animate: boolean) =>
    onInspect((current) => (current ? { ...current, amount, animate } : current));
  return (
    <div className="explode-bar" role="group" aria-label="Exploded view">
      <label className="explode-bar__slider">
        <span>Separation</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          aria-valuetext={`${percent}%`}
          onChange={(event) => set(Number(event.currentTarget.value) / 100, false)}
        />
      </label>
      <button type="button" className="button button--small" onClick={() => set(exploded ? 0 : 1, true)}>
        <span key={exploded ? 'assemble' : 'explode'}>{exploded ? 'Assemble' : 'Explode'}</span>
      </button>
      <button type="button" className="button button--small button--primary" onClick={() => onInspect(() => null)}>
        Done
      </button>
    </div>
  );
}
