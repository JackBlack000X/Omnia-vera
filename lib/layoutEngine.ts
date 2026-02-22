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

    const insertionOrder = [...cluster].sort((a, b) => {
      const aM = mover && a.id === mover.id;
      const bM = mover && b.id === mover.id;
      if (aM && !bM) return 1;
      if (!aM && bM) return -1;
      const ra = ranks ? (ranks[a.id] ?? 0) : 0;
      const rb = ranks ? (ranks[b.id] ?? 0) : 0;
      if (ra !== rb) return ra - rb;
      if (a.s !== b.s) return a.s - b.s;
      return b.duration - a.duration;
    });

    const columns: T[][] = [];

    for (const ev of insertionOrder) {
      const isMover = mover && ev.id === mover.id;
      let startSearchCol = 0;

      // ALL non-mover tasks are strictly locked to their stable column during an active drag.
      if (!isMover && draggedEventId && stableLayout?.[ev.id]) {
        const stableCol = stableLayout[ev.id].col;
        while (columns.length <= stableCol) columns.push([]);
        columns[stableCol].push(ev);
        layout[ev.id] = { col: stableCol, columns: 1, span: 1 };
        continue;
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
          
          if (isNewcomer || isBroken) {
            startSearchCol = Math.max(startSearchCol, stableLayout[o.id].col + 1);
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
