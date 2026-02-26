import { THEME } from '@/constants/theme';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 16
  },

  header: {
    marginTop: 8,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: THEME.text
  },

  progressSection: {
    marginBottom: 8
  },
  progressText: {
    color: THEME.text,
    fontSize: 26,
    fontFamily: 'BagelFatOne_400Regular',
    marginBottom: 4
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
    width: 32,
    height: 32,
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
    marginTop: -4,
  },
  foldersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 12,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderLabel: {
    color: THEME.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  folderLabelActive: {
    color: THEME.text,
    fontWeight: '600',
  },
  folderAddBtn: {
    width: 28,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
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
  taskInFolder: {
    marginVertical: 2,
  },
  folderSeparatorText: {
    paddingLeft: 3,
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
    marginTop: 20
  },
  emptyText: {
    color: THEME.textMuted,
    textAlign: 'center',
    fontSize: 16
  },

  listContainer: {
    paddingBottom: 100
  },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 98,
    backgroundColor: '#1d4ed8',
    width: 83,
    height: 83,
    borderRadius: 42,
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
    position: 'absolute',
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
