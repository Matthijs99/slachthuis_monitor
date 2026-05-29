// Svelte action: observes elements marked with [data-step] inside `node` and
// reports the index of the step crossing the viewport's vertical midline.
// No dependency — native IntersectionObserver. Honours reduced-motion only at
// the consumer side (this just reports the active index).
export type ScrollytellParams = { onActive: (index: number) => void };

export function scrollytell(node: HTMLElement, params: ScrollytellParams) {
  let onActive = params.onActive;
  let active = -1;

  const io = new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idx = Number((e.target as HTMLElement).dataset.index ?? -1);
        if (idx !== active) {
          active = idx;
          onActive(idx);
        }
      }
    },
    // Shrink the root to a thin band at the vertical centre, so the step
    // currently over the midline is the one reported as active.
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );

  const steps = Array.from(node.querySelectorAll<HTMLElement>('[data-step]'));
  steps.forEach((s, i) => { s.dataset.index = String(i); io.observe(s); });

  return {
    update(next: ScrollytellParams) { onActive = next.onActive; },
    destroy() { io.disconnect(); },
  };
}
