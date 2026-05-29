<script lang="ts">
  import { ERNST_LABELS, type Ernst } from '../lib/ernst';

  type Props = {
    ernst: Ernst;
    // Override the chip text; defaults to e.g. "3 · Hoog".
    text?: string;
  };
  let { ernst, text }: Props = $props();
  let label = $derived(text ?? `${ernst} · ${ERNST_LABELS[ernst]}`);
</script>

<span class="badge ernst-{ernst}">{label}</span>

<style>
  .badge {
    display: inline-block;
    font-size: 0.78rem;
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius);
    color: white;
    white-space: nowrap;
    background: #888;
  }
  .badge.ernst-1 { background: var(--c-ernst-1); color: #222; }
  .badge.ernst-2 { background: var(--c-ernst-2); }
  .badge.ernst-3 { background: var(--c-ernst-3); }
  .badge.ernst-4 { background: var(--c-ernst-4); }
</style>
