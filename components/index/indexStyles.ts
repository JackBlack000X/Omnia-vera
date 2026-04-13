import { THEME } from '@/constants/theme';
import { Dimensions, StyleSheet } from 'react-native';

const BASE_LAYOUT_WIDTH = 393; // iPhone Pro baseline
const MAX_LAYOUT_SCALE = 1.1;
const uiScale = Math.min(MAX_LAYOUT_SCALE, Math.max(1, Dimensions.get('window').width / BASE_LAYOUT_WIDTH));
const s = (value: number) => Math.round(value * uiScale);

export const SCREEN_HORIZONTAL_PADDING = s(14);
export const TOP_SECTION_HORIZONTAL_PADDING = 10;
export const FAB_EDGE_INSET = s(20);
export const PADDED_SCREEN_FAB_RIGHT = Math.max(0, FAB_EDGE_INSET - SCREEN_HORIZONTAL_PADDING);

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: SCREEN_HORIZONTAL_PADDING
  },

  header: {
    marginTop: 8,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  topSectionInset: {
    paddingHorizontal: TOP_SECTION_HORIZONTAL_PADDING,
  },
  title: {
    fontSize: s(28),
    fontWeight: '700',
    color: THEME.text
  },

  /** Raggruppa barra progresso + cartelle/Oggi e li sposta insieme verso l’alto */
  tasksProgressAndFoldersWrap: {
    marginTop: -10,
    paddingHorizontal: TOP_SECTION_HORIZONTAL_PADDING,
  },
  progressSection: {
    marginBottom: 8
  },
  progressText: {
    color: THEME.text,
    fontSize: s(26),
    fontFamily: 'BagelFatOne_400Regular',
    marginBottom: 0,
    marginTop: s(6)
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff'
  },
  progressActions: {
    flexDirection: 'row',
    gap: 8
  },
  progressBtn: {
    width: s(32),
    height: s(32),
    alignItems: 'center',
    justifyContent: 'center'
  },
  fabRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 98,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
    elevation: 1000,
  },
  fabTrash: {
    backgroundColor: '#ef4444',
    width: 83,
    height: 83,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  fabCancel: {
    backgroundColor: '#ffffff',
    width: 83,
    height: 83,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  fabDisabled: {
    opacity: 0.5,
  },
  foldersContainer: {
    marginBottom: 4,
    marginTop: -14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  foldersScrollHost: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden' as const,
    position: 'relative' as const,
  },
  /** Indicatore overflow: linea verticale sul bordo della zona scroll */
  folderBarOverflowLine: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    width: 2,
    borderRadius: 1,
    backgroundColor: THEME.green,
    zIndex: 4,
    transform: [{ scaleX: 0.66 }, { scaleY: 0.66 }],
  },
  folderBarOverflowLineRight: {
    right: 0,
  },
  folderBarOverflowLineLeft: {
    left: 0,
  },
  foldersScrollView: {
    flexGrow: 1,
  },
  foldersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 12,
    // Spazio dopo il + così, con molte cartelle, resta aria prima della colonna Oggi
    paddingRight: 6,
  },
  todayTabAnchor: {
    flexShrink: 0,
    marginLeft: 4,
    paddingLeft: 0,
    paddingVertical: 0,
    backgroundColor: '#000',
    zIndex: 2,
    elevation: 4,
    maxWidth: '34%',
  },
  todayTabMenu: {
    alignSelf: 'flex-start',
  },
  todayTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderLabel: {
    color: THEME.textMuted,
    fontSize: s(13),
    fontWeight: '500',
  },
  folderLabelActive: {
    color: THEME.text,
    fontWeight: '600',
  },
  folderAddBtn: {
    width: s(28),
    height: s(34),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: s(-18),
    marginTop: -1,
  },
  listWrap: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'visible' as const,
  },
  dragListContainer: {
    overflow: 'visible',
  },
  dragOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  dragOverlayTask: {
    marginHorizontal: 0,
  },
  folderRowInvisible: {
    opacity: 0,
  },
  blockInvisible: {
    opacity: 0,
    pointerEvents: 'none',
  },
  blockInvisibleCollapsed: {
    display: 'none',
  },
  sectionRowInvisible: {
    opacity: 0,
  },
  folderSeparator: {
    marginHorizontal: 4,
    paddingHorizontal: 5,
    paddingVertical: 4,
    paddingTop: 10,
  },
  folderMergeZone: {
    height: 12,
    marginVertical: 2,
  },
  folderTaskGroup: {
    paddingBottom: 4,
  },
  folderDebugBoxWrap: {
    position: 'relative' as const,
  },
  folderDebugBoxOverlay: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    // Full block bounds (header + tasks)
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: 'rgba(255, 0, 0, 0.7)',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  folderDebugInnerWrap: {
    position: 'relative' as const,
  },
  folderDebugInnerOverlay: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    // Tight box around tasks only (uses taskInFolder margin + folderTaskGroup padding)
    top: 6,
    bottom: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.95)',
    borderStyle: 'dashed',
    borderRadius: 10,
  },
  taskInFolder: {
    marginVertical: 2,
  },
  multiDragPlaceholder: {
    height: 83,
    marginVertical: 4,
  },
  multiDragBlockRow: {
    marginVertical: 0,
  },
  multiDragBlockCard: {
    height: 75,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  multiDragBlockCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  multiDragBlockCheckSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  multiDragBlockCardText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  folderSeparatorText: {
    paddingLeft: 0,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dragOverlayFolderTitle: {
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCenter: {
    width: '100%',
    maxWidth: 360,
  },
  createFolderCard: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#374151',
  },
  createFolderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  createFolderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textMuted,
    marginBottom: 8,
    marginTop: 16,
  },
  createFolderInput: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: THEME.text,
    borderWidth: 1,
    borderColor: '#374151',
  },
  createFolderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.1 }],
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    borderColor: THEME.text,
    backgroundColor: '#374151',
  },
  editFolderDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
  },
  editFolderDeleteText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
  createFolderActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  createFolderBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  createFolderBtnSecondaryText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '600',
  },
  createFolderBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  createFolderBtnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  emptyCard: {
    backgroundColor: THEME.surface,
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginHorizontal: 4,
  },
  emptyText: {
    color: THEME.textMuted,
    textAlign: 'center',
    fontSize: 16
  },

  listContainer: {
    paddingBottom: 100
  },
  taskRowInset: {
    marginHorizontal: 4,
  },

  fab: {
    position: 'absolute',
    right: FAB_EDGE_INSET,
    bottom: 98,
    zIndex: 1000,
    backgroundColor: '#1d4ed8',
    width: s(83),
    height: s(83),
    borderRadius: s(42),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1d4ed8',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12
  },
  dragActiveFolderBlock: {
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  mergePlusIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
