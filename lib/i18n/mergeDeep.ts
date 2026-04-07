export function mergeDeep<T extends Record<string, unknown>>(base: T, patch: T): T {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = base[key];
    if (
      pv &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      bv &&
      typeof bv === 'object' &&
      !Array.isArray(bv)
    ) {
      out[key] = mergeDeep(bv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      out[key] = pv;
    }
  }
  return out as T;
}
