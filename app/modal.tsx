import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConfirmationModal } from '@/components/modal/ConfirmationModal';
import { styles, COLORS } from '@/components/modal/modalStyles';
import { useModalLogic } from '@/lib/modal/useModalLogic';
import { formatDuration } from '@/lib/modal/helpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Modal multipurpose: type=new|rename|schedule|color
export default function ModalScreen() {
  const { type = 'new', id, folder } = useLocalSearchParams<{ type?: string; id?: string; folder?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const m = useModalLogic({ type, id, folder, scrollRef });

  return (
    <>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}>
          <View style={styles.box}>
          <Text style={styles.title}>
            {type === 'new' ? 'Aggiungi' : type === 'rename' ? 'Rinomina Task' : type === 'schedule' ? 'Programma Abitudine' : type === 'edit' ? 'Modifica Task' : 'Scegli Colore'}
          </Text>

          {(type === 'new' || type === 'rename' || type === 'edit') && (
            <TextInput
              value={m.text}
              onChangeText={(v) => v.length <= 100 && m.setText(v)}
              onSubmitEditing={m.save}
              placeholder="Nome"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Tipo</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                {(['task', 'abitudine', 'evento'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => m.setTipo(t)}
                    style={[styles.chip, m.tipo === t ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                  >
                    <Text style={m.tipo === t ? styles.chipActiveText : styles.chipGhostText}>
                      {t === 'task' ? 'Task' : t === 'abitudine' ? 'Abitudine' : 'Evento'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Cartella</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  onPress={() => m.setSelectedFolder(null)}
                  style={[styles.chip, m.selectedFolder === null ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.selectedFolder === null ? styles.chipActiveText : styles.chipGhostText}>Tutte</Text>
                </TouchableOpacity>
                {m.availableFolders.map(folderName => (
                  <TouchableOpacity
                    key={folderName}
                    onPress={() => m.setSelectedFolder(folderName)}
                    style={[styles.chip, m.selectedFolder === folderName ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                  >
                    <Text style={m.selectedFolder === folderName ? styles.chipActiveText : styles.chipGhostText}>{folderName}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {type === 'edit' && m.existing?.createdAt && (
            <Text style={styles.createdAt}>
              creata il {m.existing.createdAt.split('-').reverse().join('/')}
            </Text>
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={styles.colorBottom}>
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Text style={styles.sectionTitle}>Colore</Text>
              </View>
              <View style={styles.colorSheet}>
                <View style={styles.colorsRowWrap}>
                  {COLORS.map(c => (
                    <TouchableOpacity key={c} onPress={() => m.setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: m.color === c ? (c === '#ffffff' ? '#00ff00' : '#ffffff') : 'transparent' }]} />
                  ))}
                </View>
              </View>
              {/* no duplicate schedule block here */}
            </View>
          )}

          {(type === 'new' || type === 'edit') && m.tipo === 'task' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.sectionTitle}>Orario</Text>
              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(false)}
                  style={[styles.chip, !m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={!m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>Nessun orario</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => m.setTaskHasTime(true)}
                  style={[styles.chip, m.taskHasTime ? styles.chipActive : styles.chipGhost, { paddingHorizontal: 16, paddingVertical: 8 }]}
                >
                  <Text style={m.taskHasTime ? styles.chipActiveText : styles.chipGhostText}>Orario</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(type === 'schedule' || ((type === 'new' || type === 'edit') && (m.tipo !== 'task' || m.taskHasTime))) && (
            <View>
              <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>Frequenza</Text></View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => m.setFreqWithConfirmation('single')} style={[styles.chip, m.freq === 'single' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.freq === 'single' ? styles.chipActiveText : styles.chipGhostText}>Singola</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => m.setFreqWithConfirmation('daily')} style={[styles.chip, m.freq === 'daily' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.freq === 'daily' ? styles.chipActiveText : styles.chipGhostText}>Ogni giorno</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('weekly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'weekly' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.freq === 'weekly' ? styles.chipActiveText : styles.chipGhostText}>Settimanale</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('monthly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'monthly' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.freq === 'monthly' ? styles.chipActiveText : styles.chipGhostText}>Mensile</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { m.setFreqWithConfirmation('annual'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, m.freq === 'annual' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.freq === 'annual' ? styles.chipActiveText : styles.chipGhostText}>Annuale</Text>
                </TouchableOpacity>
              </View>


              {m.freq === 'weekly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni della settimana</Text>
                  <View style={styles.daysWrap}>
                    {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((d, i) => {
                      const sundayIndex = (i + 1) % 7; // map Mon->1 ... Sun->0
                      const selected = m.daysOfWeek.includes(sundayIndex);
                      return (
                        <TouchableOpacity key={i} onPress={() => m.toggleDow(sundayIndex)} style={[styles.dayPill, selected ? styles.dayPillOn : styles.dayPillOff]}>
                          <Text style={selected ? styles.dayTextOn : styles.dayTextOff}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {m.freq === 'monthly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni del mese</Text>
                  <View style={styles.monthlyDaysWrap}>
                    {Array.from({ length: 31 }).map((_, i) => (
                      <TouchableOpacity key={i} onPress={() => m.toggleMonthDay(i + 1)} style={[styles.monthlyDayPill, m.monthDays.includes(i + 1) ? styles.dayPillOn : styles.dayPillOff]}>
                        <Text style={m.monthDays.includes(i + 1) ? styles.dayTextOn : styles.dayTextOff}>{i + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}


              {m.freq === 'annual' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorno dell'anno</Text>
                  <View style={[
                    { flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
                    m.isToday && { borderWidth: 2, borderColor: '#ff3b30', borderRadius: 12, padding: 8 }
                  ]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => m.setAnnualDay(d => Math.max(1, d - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualDay}</Text>
                        <TouchableOpacity onPress={() => m.setAnnualDay(d => Math.min(31, d + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => m.setAnnualMonth(prev => Math.max(1, prev - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualMonth}</Text>
                        <TouchableOpacity onPress={() => m.setAnnualMonth(prev => Math.min(12, prev + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              {m.freq === 'single' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorno specifico</Text>
                  <View style={[
                    { flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
                    m.isToday && { borderWidth: 2, borderColor: '#ff3b30', borderRadius: 12, padding: 8 }
                  ]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => m.setAnnualDay(d => Math.max(1, d - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualDay}</Text>
                        <TouchableOpacity onPress={() => m.setAnnualDay(d => Math.min(31, d + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => m.setAnnualMonth(prev => Math.max(1, prev - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{m.annualMonth}</Text>
                        <TouchableOpacity onPress={() => m.setAnnualMonth(prev => Math.min(12, prev + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => m.setAnnualYear(y => y - 1)} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{m.annualYear}</Text>
                        <TouchableOpacity onPress={() => m.setAnnualYear(y => y + 1)} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>Orario</Text></View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => m.setModeWithConfirmation('allDay')} style={[styles.chip, m.mode === 'allDay' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.mode === 'allDay' ? styles.chipActiveText : styles.chipGhostText}>Tutto il giorno</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => m.setModeWithConfirmation('timed')} style={[styles.chip, m.mode === 'timed' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={m.mode === 'timed' ? styles.chipActiveText : styles.chipGhostText}>Orario specifico</Text>
                </TouchableOpacity>
              </View>

              {m.mode === 'timed' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Orario</Text>
                  {m.freq === 'weekly' && m.daysOfWeek.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {([1,2,3,4,5,6,0] as number[]).filter(d => m.daysOfWeek.includes(d)).map(d => {
                          const names = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
                          const label = names[d].slice(0, 3);
                          const active = m.selectedDow === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => m.setSelectedDow(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {m.freq === 'monthly' && m.monthDays.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni del mese selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {[...m.monthDays].sort((a,b)=>a-b).map(d => {
                          const label = String(d);
                          const active = m.selectedMonthDay === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => m.setSelectedMonthDay(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  <View style={styles.timeColumn}>
                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Inizio</Text>
                    <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => m.updateCurrentStartMin(Math.max(0, m.currentStartMin - 60))} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.timeValue}>{Math.floor(m.currentStartMin / 60)}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = curS + 60;
                              const maxStartMin = curE ? curE - 5 : 23 * 60;
                              m.updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => m.updateCurrentStartMin(Math.max(0, m.currentStartMin - 5))} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>−</Text>
                      </TouchableOpacity>
                            <Text style={styles.timeValue}>{m.currentStartMin % 60}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              const newStartMin = curS + 5;
                              const maxStartMin = curE ? curE - 5 : 23 * 60 + 55;
                              m.updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Fine</Text>
                      <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 60));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.timeValue}>{Math.floor(((m.currentEndMin ?? (m.currentStartMin + 60)) / 60))}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 60));
                            }} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>+</Text>
                      </TouchableOpacity>
                    </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 5));
                            }} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>−</Text>
                      </TouchableOpacity>
                            <Text style={styles.timeValue}>{((m.currentEndMin ?? (m.currentStartMin + 60)) % 60)}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = m.currentStartMin;
                              const curE = m.currentEndMin;
                              m.updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 5));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.duration}>{formatDuration((m.currentEndMin ?? (m.currentStartMin + 60)) - m.currentStartMin)}</Text>
                </View>
              )}
            </View>
          )}

          {type === 'color' && (
            <View style={[styles.colorSheet, { marginTop: 'auto' }]}>
              <View style={styles.colorsRowWrap}>
                {COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => m.setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: m.color === c ? (c === '#ffffff' ? '#00ff00' : '#ffffff') : 'transparent' }]} />
                ))}
              </View>
            </View>
          )}

          </View>
        </ScrollView>

        {/* Fixed position buttons */}
        <View style={styles.fixedButtonsContainer}>
          <TouchableOpacity onPress={m.close} style={[styles.circularBtn, styles.cancelBtn]}>
            <Ionicons name="close" size={52} color="#ff0000" />
              </TouchableOpacity>
          <TouchableOpacity onPress={m.save} style={[styles.circularBtn, styles.saveBtn]}>
            <Ionicons name="checkmark" size={52} color="#00ff00" />
              </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>

      <ConfirmationModal
        visible={m.confirmationModal.visible}
        title={m.confirmationModal.title}
        message={m.confirmationModal.message}
        onConfirm={m.confirmationModal.onConfirm}
        onCancel={m.closeConfirmationModal}
        isDark={isDark}
      />
    </>
  );
}
