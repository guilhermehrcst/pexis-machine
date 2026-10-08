import { describeEvent } from '../machine/format';
import { HISTORY_LIMIT, type LabReady, type StepRecord } from '../machine/useMachineLab';

// Each column is one real simulator step; each mark is one reported event.
// Nothing here is sampled, interpolated or synthesized.

function cpuMark(record: StepRecord): 'retired' | 'halted' | 'faulted' | null {
  let mark: 'retired' | 'halted' | 'faulted' | null = null;
  for (const event of record.events) {
    if (event.kind === 'faulted') return 'faulted';
    if (event.kind === 'halted') mark = 'halted';
    else if (event.kind === 'instruction-retired' && mark === null) mark = 'retired';
  }
  return mark;
}

function memoryMarks(record: StepRecord): Array<'fetch' | 'read' | 'write'> {
  return record.events.flatMap((event) => {
    if (event.kind === 'instruction-fetch') return ['fetch' as const];
    if (event.kind === 'memory-read') return ['read' as const];
    if (event.kind === 'memory-write') return ['write' as const];
    return [];
  });
}

export function ActivityTimeline({ lab, width }: { readonly lab: LabReady; readonly width: number }) {
  const { history } = lab;
  const padding = Math.max(0, HISTORY_LIMIT - history.length);
  const first = history[0]?.index ?? 0;
  const last = history.at(-1)?.index ?? 0;

  const columns = [
    ...Array.from({ length: padding }, (_, i) => ({ key: `pad-${i}`, record: null })),
    ...history.map((record) => ({ key: `step-${record.index}`, record })),
  ];

  return (
    <section className="activity" aria-labelledby="activity-heading">
      <header className="activity__header">
        <h2 id="activity-heading" className="panel__title">
          Runtime activity
        </h2>
        <span className="panel__meta">
          {history.length === 0 ? 'no steps yet' : `steps ${first}–${last} · core events only`}
        </span>
      </header>
      <div className="activity__grid" role="img" aria-label={`${history.length} recorded steps of CPU and memory activity`}>
        <span className="activity__lane">CPU</span>
        {columns.map(({ key, record }) => {
          const mark = record ? cpuMark(record) : null;
          return (
            <span
              key={key}
              className="activity__cell"
              title={record ? `Step ${record.index}\n${record.events.map((e) => describeEvent(e, width)).join('\n')}` : undefined}
            >
              {mark ? <span className={`mark mark--${mark}`} /> : null}
            </span>
          );
        })}
        <span className="activity__lane">Memory</span>
        {columns.map(({ key, record }) => (
          <span key={key} className="activity__cell activity__cell--stack">
            {record ? memoryMarks(record).map((m, i) => <span key={i} className={`bar bar--${m}`} />) : null}
          </span>
        ))}
        <span className="activity__lane activity__lane--planned">GPU</span>
        <span className="activity__planned">Planned · M4 — not simulated, no activity</span>
      </div>
    </section>
  );
}
