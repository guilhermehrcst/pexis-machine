import { decimal, hex64, hexAddress, registerName } from '../machine/format';
import type { LabReady } from '../machine/useMachineLab';
import { Panel } from './Panel';

export function RegistersPanel({ lab, width }: { readonly lab: LabReady; readonly width: number }) {
  const { snapshot, previous, lastStep } = lab;
  // Highlights come from register-write events the core reported, not from diffs.
  const written = new Set(
    (lastStep?.events ?? []).flatMap((event) => (event.kind === 'register-write' ? [event.reg] : [])),
  );
  const pcChanged = previous !== null && previous.pc !== snapshot.pc;

  return (
    <Panel title="Registers" id="registers" meta={<span>64-bit · from snapshot</span>}>
      <table className="regs" translate="no">
        <caption className="visually-hidden">Program counter and general-purpose registers</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Register</th>
            <th scope="col">Hex</th>
            <th scope="col">Decimal</th>
          </tr>
        </thead>
        <tbody>
          <tr className={pcChanged ? 'regs__row regs__row--pc is-changed' : 'regs__row regs__row--pc'}>
            <th scope="row">PC</th>
            <td className="mono">{hexAddress(snapshot.pc, width)}</td>
            <td className="mono regs__dec">{decimal(snapshot.pc)}</td>
          </tr>
          {snapshot.registers.map((value, index) => (
            <tr
              key={index}
              className={written.has(index) ? 'regs__row is-changed' : value === 0n ? 'regs__row is-zero' : 'regs__row'}
            >
              <th scope="row">{registerName(index)}</th>
              <td className="mono">{hex64(value)}</td>
              <td className="mono regs__dec">{decimal(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
