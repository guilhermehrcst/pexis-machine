import { useEffect, useRef, useState } from 'react';
import { addressWidth, bytesHuman, hexAddress } from '../machine/format';
import { PACES } from '../machine/runner';
import type { LabReady } from '../machine/useMachineLab';
import { MachineScene } from '../scene/MachineScene';
import type { InspectionState } from './inspectionState';
import { visualizeStep, type ComponentId } from '../scene/transfers';

interface SceneViewProps {
  readonly lab: LabReady;
  readonly selected: ComponentId | null;
  readonly onSelect: (id: ComponentId | null) => void;
  readonly inspection: InspectionState | null;
  readonly onSelectPart: (partId: string | null) => void;
  /** Where the part inspector is rendered; a change moves an overlay, so insets are re-measured. */
  readonly partsLayout: 'overlay' | 'below';
  readonly reducedMotion: boolean;
}

const MANUAL_STEP_MS = 900;

export function SceneView({ lab, selected, onSelect, inspection, onSelectPart, partsLayout, reducedMotion }: SceneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MachineScene | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectPartRef = useRef(onSelectPart);
  const inspecting = inspection?.component ?? null;
  const [failure, setFailure] = useState<string | null>(null);
  const memorySize = lab.client.memorySize;

  useEffect(() => {
    onSelectRef.current = onSelect;
    onSelectPartRef.current = onSelectPart;
  }, [onSelect, onSelectPart]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MachineScene | null = null;
    try {
      const width = addressWidth(memorySize);
      scene = new MachineScene(container, {
        onSelect: (id) => onSelectRef.current(id),
        onSelectPart: (part) => onSelectPartRef.current(part),
        ramLabel: `${bytesHuman(memorySize)} linear`,
        formatAddress: (address) => hexAddress(address, width),
      });
      sceneRef.current = scene;
      setFailure(null);
    } catch (error) {
      console.warn('3D view unavailable', error);
      setFailure(error instanceof Error ? error.message : 'WebGL is not available');
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [memorySize]);

  // Exploded inspection. Declared before the overlay measurement below, so the
  // scene starts its camera transition first and the new overlay insets then
  // retarget that transition instead of cutting it with a jump.
  useEffect(() => sceneRef.current?.setInspection(inspecting), [inspecting, failure]);
  const amount = inspection?.amount ?? 0;
  const animate = inspection?.animate ?? true;
  useEffect(() => {
    if (inspecting) sceneRef.current?.setExplodeAmount(amount, animate);
  }, [inspecting, amount, animate, failure]);
  const part = inspection?.part ?? null;
  useEffect(() => sceneRef.current?.setSelectedPart(part), [inspecting, part, failure]);

  // The camera frames the hardware inside the area not covered by the HTML
  // overlays of the stage (component switcher on top, legend or exploded-view
  // controls at the bottom, and the part inspector on the left while
  // inspecting a wide stage). Measured from the real layout so no per-device
  // constants are needed.
  useEffect(() => {
    const container = containerRef.current;
    const stage = container?.parentElement;
    if (!container || !stage) return;
    const measure = () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const box = container.getBoundingClientRect();
      const switcher = stage.querySelector('.segmented')?.getBoundingClientRect();
      const bar = stage.querySelector('.explode-bar');
      const legend = bar ?? stage.querySelector('.stage__legend');
      const legendBox = legend instanceof HTMLElement && legend.offsetParent !== null ? legend.getBoundingClientRect() : null;
      // On a wide stage the part card overlays the left side and the exploded
      // module is framed beside it. On a narrow stage MachineView renders the
      // card below the stage, so it is not found here and reserves nothing.
      const card = bar ? stage.querySelector('.inspector__card--parts')?.getBoundingClientRect() : undefined;
      const left = card ? Math.max(0, Math.round(card.right - box.left)) : 0;
      scene.setFramingInsets({
        top: switcher ? Math.max(0, Math.round(switcher.bottom - box.top)) : 0,
        bottom: legendBox ? Math.max(0, Math.round(box.bottom - legendBox.top)) : 0,
        left,
        right: 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [failure, inspecting, partsLayout]);

  useEffect(() => sceneRef.current?.setSelected(selected), [selected, failure]);
  useEffect(() => sceneRef.current?.setStatus(lab.snapshot.status), [lab.snapshot.status, failure]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion, failure]);
  useEffect(() => {
    const interval = lab.running ? PACES[lab.pace].intervalMs * 0.85 : MANUAL_STEP_MS;
    sceneRef.current?.setStepDuration(interval);
  }, [lab.running, lab.pace, failure]);

  // Animate exactly the events the core reported for the most recent step.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (lab.lastStep === null) {
      scene.clearActivity();
      return;
    }
    scene.play(visualizeStep(lab.lastStep.events));
  }, [lab.lastStep]);

  return (
    <div className="scene" ref={containerRef}>
      {failure ? (
        <div className="scene__fallback" role="status">
          <strong>3D view unavailable</strong>
          <span>WebGL could not start ({failure}). Every control and panel keeps working.</span>
        </div>
      ) : null}
    </div>
  );
}
