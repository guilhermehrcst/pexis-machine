import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { useMemo, useState, type FormEvent } from 'react';
import { bytesHuman, hexAddress, hexByte } from '../machine/format';
import { BYTES_PER_ROW, PAGE_BYTES, addressInRam, memoryWindow, parseAddress } from '../machine/memoryWindow';
import type { LabReady } from '../machine/useMachineLab';
import { Panel } from './Panel';

type Touch = 'fetch' | 'read' | 'write';

const COLUMNS = Array.from({ length: BYTES_PER_ROW }, (_, i) => i);

export function MemoryPanel({ lab, width }: { readonly lab: LabReady; readonly width: number }) {
  const { client, version, lastStep, snapshot } = lab;
  const memorySize = client.memorySize;
  const [requested, setRequested] = useState(0);
  const [input, setInput] = useState('0x0000');
  const [inputError, setInputError] = useState(false);
  const page = memoryWindow(requested, memorySize);

  // Only the visible page is read from the simulator, after every change.
  const bytes = useMemo(() => client.readMemory(page.start, page.length), [client, page.start, page.length, version]);

  // Byte highlights come from the core's events for the last step.
  const touched = useMemo(() => {
    const map = new Map<number, Touch>();
    for (const event of lastStep?.events ?? []) {
      if (event.kind !== 'instruction-fetch' && event.kind !== 'memory-read' && event.kind !== 'memory-write') continue;
      const start = addressInRam(event.address, memorySize);
      if (start === null) continue;
      const kind: Touch = event.kind === 'instruction-fetch' ? 'fetch' : event.kind === 'memory-read' ? 'read' : 'write';
      for (let i = 0; i < event.size && start + i < memorySize; i += 1) map.set(start + i, kind);
    }
    return map;
  }, [lastStep, memorySize]);

  const lastDataAccess = useMemo(() => {
    const event = [...(lastStep?.events ?? [])]
      .reverse()
      .find((e) => e.kind === 'memory-read' || e.kind === 'memory-write');
    return event ? addressInRam(event.address, memorySize) : null;
  }, [lastStep, memorySize]);

  const go = (address: number) => {
    const next = memoryWindow(address, memorySize);
    setRequested(next.start);
    setInput(hexAddress(next.start, width));
    setInputError(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = parseAddress(input);
    if (address === null || address >= memorySize) {
      setInputError(true);
      return;
    }
    go(address);
  };

  const pc = addressInRam(snapshot.pc, memorySize);
  const rows = Math.ceil(page.length / BYTES_PER_ROW);

  return (
    <Panel
      title="Memory"
      id="memory"
      className="panel--memory"
      meta={<span>{bytesHuman(memorySize)} RAM · little-endian</span>}
      actions={
        <div className="memory-nav">
          <button
            type="button"
            className="icon-button"
            onClick={() => go(page.start - PAGE_BYTES)}
            disabled={page.start === 0}
            aria-label="Previous page"
          >
            <ChevronLeftIcon aria-hidden="true" />
          </button>
          <form onSubmit={submit} className="memory-nav__form">
            <label className="visually-hidden" htmlFor="memory-offset">
              Go to address
            </label>
            <input
              id="memory-offset"
              className={inputError ? 'input mono is-invalid' : 'input mono'}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-invalid={inputError}
              spellCheck={false}
              autoComplete="off"
              inputMode="text"
            />
          </form>
          <button
            type="button"
            className="icon-button"
            onClick={() => go(page.start + PAGE_BYTES)}
            disabled={page.start + page.length >= memorySize}
            aria-label="Next page"
          >
            <ChevronRightIcon aria-hidden="true" />
          </button>
          <button type="button" className="button button--ghost button--small" onClick={() => pc !== null && go(pc)} disabled={pc === null}>
            PC
          </button>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={() => lastDataAccess !== null && go(lastDataAccess)}
            disabled={lastDataAccess === null}
            title="Jump to the last load/store address"
          >
            Last access
          </button>
        </div>
      }
    >
      <div className="hex" translate="no" role="table" aria-label={`RAM bytes ${hexAddress(page.start, width)} to ${hexAddress(page.start + page.length - 1, width)}`}>
        <div className="hex__row hex__row--head" role="row">
          <span className="hex__addr" role="columnheader">
            address
          </span>
          {COLUMNS.map((column) => (
            <span key={column} className="hex__cell" role="columnheader">
              {hexByte(column)}
            </span>
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => {
          const rowStart = page.start + row * BYTES_PER_ROW;
          return (
            <div key={rowStart} className="hex__row" role="row">
              <span className="hex__addr" role="rowheader">
                {hexAddress(rowStart, width)}
              </span>
              {COLUMNS.map((column) => {
                const offset = row * BYTES_PER_ROW + column;
                const address = rowStart + column;
                const value = bytes[offset];
                if (value === undefined) return <span key={column} className="hex__cell" role="cell" />;
                const touch = touched.get(address);
                const classes = ['hex__cell'];
                if (value === 0) classes.push('is-zero');
                if (touch) classes.push(`is-${touch}`);
                if (address === pc) classes.push('is-pc');
                return (
                  <span key={column} className={classes.join(' ')} role="cell">
                    {hexByte(value)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="legend" aria-hidden="true">
        <span className="legend__item legend__item--fetch">fetch</span>
        <span className="legend__item legend__item--read">load</span>
        <span className="legend__item legend__item--write">store</span>
        <span className="legend__item legend__item--pc">PC</span>
      </div>
    </Panel>
  );
}
