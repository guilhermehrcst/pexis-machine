import { describeEvent } from '../machine/format';
import type { MachineEventKind } from '../machine/types';
import type { LabReady } from '../machine/useMachineLab';
import { Panel } from './Panel';

const KIND_LABEL: Readonly<Record<MachineEventKind, string>> = {
  'instruction-fetch': 'fetch',
  'memory-read': 'load',
  'memory-write': 'store',
  'register-write': 'reg',
  'instruction-retired': 'retire',
  halted: 'halt',
  faulted: 'fault',
};

// The literal event list the core emitted for the most recent step. This is
// what the 3D view animates.
export function EventsPanel({ lab, width }: { readonly lab: LabReady; readonly width: number }) {
  const { lastStep } = lab;
  return (
    <Panel
      title="Last step"
      id="events"
      className="panel--events"
      meta={<span>{lastStep ? `step ${lastStep.index} · core events` : 'core events'}</span>}
    >
      {lastStep === null ? (
        <p className="empty">Press Step to execute one instruction in the C++ core.</p>
      ) : lastStep.events.length === 0 ? (
        <p className="empty">No transition: the machine is stopped.</p>
      ) : (
        <ol className="events">
          {lastStep.events.map((event, i) => (
            <li key={i} className={`events__item events__item--${event.kind}`}>
              <span className="events__kind">{KIND_LABEL[event.kind]}</span>
              <span className="mono">{describeEvent(event, width)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
