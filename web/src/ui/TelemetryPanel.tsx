import { FAULT_LABEL, STATUS_LABEL, byteCount, decimal } from '../machine/format';
import type { Telemetry } from '../machine/types';
import type { LabReady } from '../machine/useMachineLab';
import { Panel } from './Panel';

export interface MetricSpec {
  readonly key: keyof Telemetry;
  readonly label: string;
  readonly unit: 'count' | 'bytes';
  readonly definition: string;
  /** The label is an ISA/telemetry term (e.g. Stores = STORE64 count), not prose. */
  readonly term?: boolean;
}

export const METRICS: readonly MetricSpec[] = [
  { key: 'instructionsRetired', label: 'Instructions retired', unit: 'count', definition: 'Instructions that completed. A faulting instruction never retires.' },
  { key: 'cycles', label: 'Cycles', unit: 'count', definition: 'Abstract cycles: one per retired instruction in the functional model. Not physical time.' },
  { key: 'loads', label: 'Loads', unit: 'count', definition: 'Completed LOAD64 data reads.', term: true },
  { key: 'stores', label: 'Stores', unit: 'count', definition: 'Completed STORE64 data writes.', term: true },
  { key: 'instructionBytes', label: 'Instruction bytes', unit: 'bytes', definition: 'Bytes fetched from RAM to decode instructions, including bytes fetched by a faulting instruction.' },
  { key: 'dataBytesRead', label: 'Data bytes read', unit: 'bytes', definition: 'Bytes moved RAM → CPU by loads.' },
  { key: 'dataBytesWritten', label: 'Data bytes written', unit: 'bytes', definition: 'Bytes moved CPU → RAM by stores.' },
  { key: 'bytesMoved', label: 'Bytes moved', unit: 'bytes', definition: 'Instruction bytes + data bytes read + data bytes written, computed by the core.' },
];

export function formatMetric(spec: MetricSpec, telemetry: Telemetry): string {
  const value = telemetry[spec.key];
  return spec.unit === 'bytes' ? byteCount(value) : decimal(value);
}

export function TelemetryPanel({ lab }: { readonly lab: LabReady }) {
  const { snapshot, previous } = lab;
  return (
    <Panel title="Telemetry" id="telemetry" meta={<span>core counters</span>}>
      <dl className="metrics">
        {METRICS.map((spec) => {
          const changed = previous !== null && previous.telemetry[spec.key] !== snapshot.telemetry[spec.key];
          return (
            <div key={spec.key} className={changed ? 'metrics__row is-changed' : 'metrics__row'} title={spec.definition}>
              <dt translate={spec.term ? 'no' : undefined}>{spec.label}</dt>
              <dd className="mono" translate="no">
                {formatMetric(spec, snapshot.telemetry)}
              </dd>
            </div>
          );
        })}
        <div className="metrics__row metrics__row--status">
          <dt>Status</dt>
          <dd className={`mono status-text status-text--${snapshot.status}`} translate="no">
            {STATUS_LABEL[snapshot.status]}
            {snapshot.status === 'faulted' ? ` · ${FAULT_LABEL[snapshot.fault]}` : ''}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
