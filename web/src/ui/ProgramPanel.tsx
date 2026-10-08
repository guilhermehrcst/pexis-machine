import { useMemo } from 'react';
import { FAULT_LABEL, hexAddress, hexByte } from '../machine/format';
import type { ProgramLine } from '../machine/types';
import type { LabReady } from '../machine/useMachineLab';
import { Panel } from './Panel';

type LineState = 'next' | 'executed' | 'fault' | 'idle';

export function ProgramPanel({ lab, width }: { readonly lab: LabReady; readonly width: number }) {
  const { program, snapshot, lastStep, client, version } = lab;

  // Raw bytes are read from RAM for each decoded line: the listing is the
  // program that is really loaded, decoded by the C++ core.
  const bytes = useMemo(() => {
    if (!program) return [];
    return program.instructions.map((line) => {
      const length = Math.min(line.length, 10);
      const address = Number(line.address);
      if (length === 0 || address + length > client.memorySize) return '';
      return Array.from(client.readMemory(address, length), hexByte).join(' ');
    });
    // version: RAM may change on every step (a STORE can overwrite code).
  }, [program, client, version]);

  const executedAt = lastStep?.events.find((e) => e.kind === 'instruction-fetch')?.address ?? null;

  const stateOf = (line: ProgramLine): LineState => {
    if (snapshot.status === 'faulted' && line.address === snapshot.pc) return 'fault';
    if (snapshot.status !== 'halted' && snapshot.status !== 'faulted' && line.address === snapshot.pc) return 'next';
    if (executedAt !== null && line.address === executedAt) return 'executed';
    return 'idle';
  };

  const pcOutside =
    program !== null &&
    snapshot.status !== 'halted' &&
    !program.instructions.some((line) => line.address === snapshot.pc);

  return (
    <Panel
      title="Program"
      id="program"
      className="panel--program"
      meta={program ? <span>{program.length} B · decoded from RAM</span> : null}
    >
      {program === null ? (
        <p className="empty">No program loaded.</p>
      ) : (
        <ol className="listing" aria-label="Loaded program">
          {program.instructions.map((line, index) => {
            const state = stateOf(line);
            return (
              <li
                key={`${line.address}`}
                className={`listing__line is-${state}${line.status !== 'ok' ? ' is-invalid' : ''}`}
                aria-current={state === 'next' ? 'step' : undefined}
              >
                <span className="listing__marker" aria-hidden="true" />
                <span className="listing__addr mono">{hexAddress(line.address, width)}</span>
                <span className="listing__bytes mono" title={bytes[index]}>
                  {bytes[index]}
                </span>
                <span className="listing__text mono">{line.text}</span>
                {state === 'next' ? <span className="visually-hidden"> (next instruction, PC)</span> : null}
                {state === 'fault' ? (
                  <span className="listing__note">{FAULT_LABEL[snapshot.fault]}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {pcOutside ? (
        <p className="note">PC {hexAddress(snapshot.pc, width)} is outside the decoded listing.</p>
      ) : null}
      {snapshot.status === 'halted' ? <p className="note note--ok">Halted. Reset to run again.</p> : null}
    </Panel>
  );
}
