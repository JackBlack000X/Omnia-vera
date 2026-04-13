import type { Habit } from '@/lib/habits/schema';

type HabitFolderFields = Pick<Habit, 'folder' | 'folders'>;

export function normalizeFolderName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeFolderNames(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of rawValues) {
    const normalized = normalizeFolderName(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export function getHabitFolders(habit: HabitFolderFields | null | undefined): string[] {
  if (!habit) return [];
  return normalizeFolderNames([
    habit.folder,
    ...(Array.isArray(habit.folders) ? habit.folders : []),
  ]);
}

export function getPrimaryHabitFolder(habit: HabitFolderFields | null | undefined): string | undefined {
  return getHabitFolders(habit)[0];
}

export function habitHasFolder(habit: HabitFolderFields | null | undefined, folderName: string | null | undefined): boolean {
  const normalizedFolder = normalizeFolderName(folderName);
  if (!normalizedFolder) return false;
  return getHabitFolders(habit).includes(normalizedFolder);
}

export function withHabitFolders<T extends HabitFolderFields>(
  habit: T,
  nextFolders: string | string[] | null | undefined,
): T {
  const normalizedFolders = normalizeFolderNames(nextFolders);
  const currentFolders = getHabitFolders(habit);
  const sameFolders =
    currentFolders.length === normalizedFolders.length &&
    currentFolders.every((folderName, index) => folderName === normalizedFolders[index]);

  if (sameFolders) {
    const currentPrimary = normalizeFolderName(habit.folder);
    const nextPrimary = normalizedFolders[0];
    const currentRawFolders = Array.isArray(habit.folders) ? habit.folders : undefined;
    const currentArrayMatches =
      (currentRawFolders == null && normalizedFolders.length === 0) ||
      (Array.isArray(currentRawFolders) &&
        currentRawFolders.length === normalizedFolders.length &&
        currentRawFolders.every((folderName, index) => folderName === normalizedFolders[index]));
    if (currentPrimary === nextPrimary && currentArrayMatches) return habit;
  }

  return {
    ...habit,
    folder: normalizedFolders[0],
    folders: normalizedFolders.length > 0 ? normalizedFolders : undefined,
  };
}

export function ensureHabitFolderFields<T extends HabitFolderFields>(habit: T): T {
  return withHabitFolders(habit, getHabitFolders(habit));
}

export function renameHabitFolderMembership<T extends HabitFolderFields>(
  habit: T,
  oldName: string,
  newName: string,
): T {
  const normalizedOldName = normalizeFolderName(oldName);
  const normalizedNewName = normalizeFolderName(newName);
  if (!normalizedOldName || !normalizedNewName) return habit;

  const nextFolders = getHabitFolders(habit).map((folderName) =>
    folderName === normalizedOldName ? normalizedNewName : folderName,
  );
  return withHabitFolders(habit, nextFolders);
}

export function removeHabitFolderMembership<T extends HabitFolderFields>(habit: T, folderName: string): T {
  const normalizedFolder = normalizeFolderName(folderName);
  if (!normalizedFolder) return habit;

  const nextFolders = getHabitFolders(habit).filter((name) => name !== normalizedFolder);
  return withHabitFolders(habit, nextFolders);
}

export function replaceHabitFolderMembership<T extends HabitFolderFields>(
  habit: T,
  sourceFolderName: string | null | undefined,
  targetFolderName: string | null | undefined,
): T {
  const normalizedSource = normalizeFolderName(sourceFolderName);
  const normalizedTarget = normalizeFolderName(targetFolderName);
  let nextFolders = getHabitFolders(habit);

  if (normalizedSource) {
    nextFolders = nextFolders.filter((folderName) => folderName !== normalizedSource);
  }

  if (normalizedTarget && !nextFolders.includes(normalizedTarget)) {
    nextFolders = [...nextFolders, normalizedTarget];
  }

  return withHabitFolders(habit, nextFolders);
}
