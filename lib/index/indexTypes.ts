import type { Habit } from '@/lib/habits/schema';

export type FolderItem = { id: string; name: string; color: string; icon?: string };

export type FolderBlockItem = { type: 'folderBlock'; folderName: string | null; folderId: string; tasks: Habit[] };
export type TaskItem = { type: 'task'; habit: Habit };
export type SectionItem = FolderBlockItem | TaskItem;

export type SortModeType = 'creation' | 'alphabetical' | 'custom' | 'time' | 'color' | 'folder';

export const FOLDER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899', '#9ca3af'];

export const FOLDER_ICONS: { name: string; label: string }[] = [
  { name: 'folder-outline', label: 'Cartella' },
  { name: 'folder-open-outline', label: 'Aperta' },
  { name: 'document-text-outline', label: 'Documento' },
  { name: 'bookmark-outline', label: 'Segnalibro' },
  { name: 'star-outline', label: 'Stella' },
  { name: 'heart-outline', label: 'Cuore' },
  { name: 'flag-outline', label: 'Bandiera' },
  { name: 'briefcase-outline', label: 'Valigetta' },
  { name: 'archive-outline', label: 'Archivio' },
];

export const TUTTE_KEY = '__tutte__';
export const OGGI_TODAY_KEY = '__oggi__'; // virtual folder: tasks appearing today only
