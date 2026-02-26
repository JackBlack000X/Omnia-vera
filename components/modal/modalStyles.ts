import { StyleSheet } from 'react-native';

export const COLORS = ['#000000', '#ef4444', '#f59e0b', '#fbbf24', '#10b981', '#60a5fa', '#3b82f6', '#6366f1', '#ec4899', '#ffffff', '#9ca3af'];

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', paddingHorizontal: 14 },
  box: { marginTop: 16, paddingBottom: 20 },
  title: { color: 'white', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  input: { color: 'white', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: '#0f172a' },
  placeholder: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' },
  placeholderText: { color: '#cbd5e1' },
  colorSheet: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' },
  colorsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16, justifyContent: 'center' },
  colorSwatch: { width: 48, height: 48, borderRadius: 999, borderWidth: 2 },
  colorBottom: { marginTop: 'auto' },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: 'white', fontWeight: '600' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' },
  btnGhostText: { color: '#e2e8f0' },
  btnPrimary: { backgroundColor: '#ec4899', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  btnPrimaryText: { color: 'white', fontWeight: '700' },

  // Circular action buttons
  circularBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  cancelBtn: {
    backgroundColor: '#991b1b' // Less dimmed red
  },
  saveBtn: {
    backgroundColor: '#065f46' // Less dimmed green
  },

  // Fixed position buttons
  fixedButtonsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    zIndex: 1000,
    backgroundColor: 'transparent'
  },

  sectionHeader: { marginTop: 8 },
  sectionTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 18 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  chipGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' },
  chipGhostText: { color: '#e2e8f0' },
  chipActive: { backgroundColor: '#ec4899' },
  chipActiveText: { color: 'white', fontWeight: '700' },

  subtle: { color: '#94a3b8', marginTop: 8, marginBottom: 6 },
  createdAt: { color: '#475569', fontSize: 12, marginTop: 6, marginLeft: 2 },
  timeColumn: { gap: 16 },
  timeSection: { gap: 8 },
  timeSectionTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16
  },
  timeStepper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center'
  },
  timeStepperText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700'
  },
  timeBox: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginHorizontal: 8
  },
  timeActive: { backgroundColor: 'transparent' },
  timeText: { color: 'white', fontSize: 22, fontWeight: '800' },
  duration: { color: '#94a3b8', marginTop: 8, textAlign: 'center' },

  // New time controls
  timeControls: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  timeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  timeStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },

  daysWrap: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, justifyContent: 'center' },
  monthlyDaysWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  dayPill: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, minWidth: 40, alignItems: 'center' },
  monthlyDayPill: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minWidth: 32, alignItems: 'center' },
  dayPillOn: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  dayPillOff: { backgroundColor: 'transparent', borderColor: '#334155' },
  dayTextOn: { color: 'white', fontWeight: '700' },
  dayTextOff: { color: '#e2e8f0' },
});
