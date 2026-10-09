import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPUTE_INSPECTION } from '../scene/components/PexisComputeModule';
import { inspectionFor } from '../scene/inspections';
import { PartInspector } from './Inspector';

function render(part: string | null): string {
  return renderToStaticMarkup(
    createElement(PartInspector, {
      inspectable: COMPUTE_INSPECTION,
      inspection: { component: 'cpu', part, amount: 1, animate: true },
      onInspect: () => {},
    }),
  );
}

describe('part inspector', () => {
  it('states the semantic id, role and nature of the selected part', () => {
    const html = render('activity-ring');
    expect(html).toContain('cpu/activity-ring');
    expect(html).toContain('observation-activity');
    expect(html).toContain('Observation of real core state');
    expect(render('compute-tile')).toContain('Illustrative physical geometry');
  });

  it('always says what the core really simulates, and that no part is simulated', () => {
    for (const part of [null, 'package', 'compute-tile']) {
      expect(render(part)).toContain('None of these parts is a simulated structure.');
    }
  });

  it('never claims cores, caches or clocks for the compute tile', () => {
    const tile = COMPUTE_INSPECTION.parts['compute-tile']!.summary;
    expect(tile).toMatch(/not a floorplan/);
    for (const info of Object.values(COMPUTE_INSPECTION.parts)) {
      expect(`${info.summary} ${info.relation}`).not.toMatch(/\b(GHz|MHz|Zen|nm|cache size|chiplet)\b/i);
    }
  });

  it('lists every part as a keyboard-reachable, untranslated identifier', () => {
    const html = render(null);
    expect(html).toMatch(/class="part-list" role="group" aria-label="Parts" translate="no"/);
    for (const step of COMPUTE_INSPECTION.plan.steps) {
      expect(html).toContain(`>${COMPUTE_INSPECTION.parts[step.partId]!.title}</button>`);
    }
  });

  it('offers exploded inspection for the compute module only in M1G', () => {
    expect(inspectionFor('cpu')).toBe(COMPUTE_INSPECTION);
    expect(inspectionFor('ram')).toBeNull();
    expect(inspectionFor('interconnect')).toBeNull();
    // The planned GPU has no parts to inspect and must not look functional.
    expect(inspectionFor('gpu')).toBeNull();
    expect(inspectionFor(null)).toBeNull();
  });
});
