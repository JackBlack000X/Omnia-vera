export type LayoutInfo = {
  col: number;
  columns: number;
  span: number;
};

export type BaseEvent = {
  id: string;
  s: number;
  e: number;
  duration: number;
};

export function calculateLayout<T extends BaseEvent>(
  events: T[],
  draggedEventId: string | null,
  stableLayout: Record<string, LayoutInfo> | undefined,
  ranks: Record<string, number>,
  initialOverlaps: Set<string>,
  brokenOverlapPairs: Set<string>
): Record<string, LayoutInfo> {
  const layout: Record<string, LayoutInfo> = {};
  const ov = (a: { s: number; e: number }, b: { s: number; e: number }) =>
    Math.max(a.s, b.s) < Math.min(a.e, b.e);
  
  // 1. Cluster events by time overlap
  const sorted = [...events].sort((a, b) => {
    if (a.s !== b.s) return a.s - b.s;
    return b.duration - a.duration;
  });

  const clusters: T[][] = [];
  let curCluster: T[] = [];
  let clEnd = -1;

  for (const ev of sorted) {
    if (curCluster.length === 0) {
      curCluster.push(ev);
      clEnd = ev.e;
    } else if (ev.s < clEnd) {
      curCluster.push(ev);
      clEnd = Math.max(clEnd, ev.e);
    } else {
      clusters.push(curCluster);
      curCluster = [ev];
      clEnd = ev.e;
    }
  }
  if (curCluster.length > 0) clusters.push(curCluster);

  // 2. Process each cluster
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      layout[cluster[0].id] = { col: 0, columns: 1, span: 1 };
      continue;
    }

    const moverId = draggedEventId;
    const mover = moverId ? cluster.find(e => e.id === moverId) : null;

    // True when the cluster has grown to include tasks that didn't originally overlap
    // the mover (e.g. a standalone event D that A dragged into). In this case the
    // stable-column lock would produce too many columns, so we skip it entirely.
    const hasNewcomerNonMover = !!mover && cluster.some(e => {
      if (e.id === moverId) return false;
      const pk1 = `${moverId}-${e.id}`;
      const pk2 = `${e.id}-${moverId}`;
      return !initialOverlaps.has(pk1) && !initialOverlaps.has(pk2);
    });

    const insertionOrder = [...cluster].sort((a, b) => {
      const aM = mover && a.id === mover.id;
      const bM = mover && b.id === mover.id;
      if (aM && !bM) return 1;
      if (!aM && bM) return -1;
      // Always sort non-movers by stable col to preserve the original left→right order,
      // both for locked and unlocked tasks (prevents order swaps mid-drag).
      if (stableLayout) {
        const sa = stableLayout[a.id]?.col ?? 0;
        const sb = stableLayout[b.id]?.col ?? 0;
        if (sa !== sb) return sa - sb;
      }
      // Fallback when no stable layout (initial render).
      const ra = ranks ? (ranks[a.id] ?? 0) : 0;
      const rb = ranks ? (ranks[b.id] ?? 0) : 0;
      if (ra !== rb) return ra - rb;
      const dur = b.duration - a.duration;
      if (dur !== 0) return dur;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // Determine which non-movers are unlocked: direct (broken pair with mover) OR
    // cascade (an already-unlocked task with a lower stableCol overlaps this one).
    // Cascade ensures the whole overlapping chain redistributes when a gap opens,
    // preventing holes where a locked task is stuck at a stableCol no longer valid.
    const unlockedNonMovers = new Set<string>();
    if (mover && !hasNewcomerNonMover && stableLayout) {
      const nonMoversInOrder = cluster
        .filter(e => e.id !== mover.id)
        .sort((a, b) => (stableLayout[a.id]?.col ?? 0) - (stableLayout[b.id]?.col ?? 0));
      for (const nm of nonMoversInOrder) {
        const pk1 = `${mover.id}-${nm.id}`;
        const pk2 = `${nm.id}-${mover.id}`;
        if (brokenOverlapPairs.has(pk1) || brokenOverlapPairs.has(pk2)) {
          unlockedNonMovers.add(nm.id);
          continue;
        }
        const nmCol = stableLayout[nm.id]?.col ?? 0;
        for (const uid of unlockedNonMovers) {
          const other = cluster.find(e => e.id === uid);
          if (!other || !stableLayout[other.id]) continue;
          if ((stableLayout[other.id].col ?? 0) < nmCol && ov(nm, other)) {
            unlockedNonMovers.add(nm.id);
            break;
          }
        }
      }
    }

    const columns: T[][] = [];

    for (const ev of insertionOrder) {
      const isMover = mover && ev.id === mover.id;
      let startSearchCol = 0;

      if (!isMover && mover && stableLayout?.[ev.id]) {
        const isUnlocked = hasNewcomerNonMover || unlockedNonMovers.has(ev.id);

        if (!isUnlocked) {
          // Locked: place at stable column and skip fresh placement.
          const stableCol = stableLayout[ev.id].col;
          while (columns.length <= stableCol) columns.push([]);
          columns[stableCol].push(ev);
          layout[ev.id] = { col: stableCol, columns: 1, span: 1 };
          continue;
        }

        // Unlocked: prevent jumping LEFT of any locked non-mover that this task
        // overlaps and sits to its left in the original layout.
        const sx = stableLayout[ev.id].col;
        for (const other of cluster) {
          if (other.id === ev.id || other.id === mover.id) continue;
          if (!stableLayout?.[other.id]) continue;
          const otherIsLocked = !hasNewcomerNonMover && !unlockedNonMovers.has(other.id);
          if (!otherIsLocked) continue;
          const sy = stableLayout[other.id].col;
          if (sy < sx && ov(ev, other)) {
            startSearchCol = Math.max(startSearchCol, sy + 1);
          }
        }
      }

      // For the mover task, determine if it should be forced to the right of any task it overlaps.
      if (isMover && draggedEventId) {
        const currentOverlaps = cluster.filter(o => o.id !== ev.id && ov(ev, o));
        
        const isNewcomer = currentOverlaps.length > 0 && currentOverlaps.every(o => {
          const pk1 = `${ev.id}-${o.id}`;
          const pk2 = `${o.id}-${ev.id}`;
          return !initialOverlaps.has(pk1) && !initialOverlaps.has(pk2);
        });

        for (const o of currentOverlaps) {
          if (!stableLayout?.[o.id]) continue;
          const pairKey1 = `${ev.id}-${o.id}`;
          const pairKey2 = `${o.id}-${ev.id}`;
          const isBroken = brokenOverlapPairs.has(pairKey1) || brokenOverlapPairs.has(pairKey2);

          // For broken pairs: don't adjust startSearchCol — the mover lands rightmost
          // naturally because the broken-pair tasks are unlocked and fill earlier columns.
          if (isBroken) continue;

          if (isNewcomer) {
            // Newcomer entering a brand-new cluster: preserve original left-right order.
            const moverOrigCol = stableLayout?.[ev.id]?.col ?? Infinity;
            const oOrigCol = stableLayout[o.id].col;
            if (moverOrigCol < oOrigCol) continue;
            startSearchCol = Math.max(startSearchCol, oOrigCol + 1);
          }
        }
      }

      let placed = false;
      for (let i = startSearchCol; i < columns.length; i++) {
        if (!columns[i] || !columns[i].some(existing => ov(ev, existing))) {
          while (columns.length <= i) columns.push([]);
          columns[i].push(ev);
          layout[ev.id] = { col: i, columns: 1, span: 1 };
          placed = true;
          break;
        }
      }
      if (!placed) {
        while (columns.length < startSearchCol) columns.push([]);
        columns.push([ev]);
        layout[ev.id] = { col: columns.length - 1, columns: 1, span: 1 };
      }
    }

    // Calculate spans
    const totalCols = columns.length;

    for (const ev of cluster) {
      const el = layout[ev.id];
      if (!el) continue;

      let expandSpan = 1;
      for (let nc = el.col + 1; nc < totalCols; nc++) {
        if (columns[nc] && columns[nc].some(o => o.id !== ev.id && ov(ev, o))) break;
        expandSpan++;
      }

      el.columns = totalCols;
      el.span = expandSpan;
    }
  }

  return layout;
}
