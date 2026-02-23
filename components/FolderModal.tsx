import { THEME } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type FolderData = { name: string; iconColor: string; icon: string };

const FOLDER_COLORS = ['#9ca3af', '#3b82f6', '#10b981', '#fbbf24', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const FOLDER_ICONS: { name: string; label: string }[] = [
  { name: 'folder', label: 'Cartella' },
  { name: 'folder-open', label: 'Aperta' },
  { name: 'document', label: 'Documento' },
  { name: 'document-text', label: 'Testo' },
  { name: 'archive', label: 'Archivio' },
  { name: 'briefcase', label: 'Valigetta' },
  { name: 'book', label: 'Libro' },
  { name: 'bookmarks', label: 'Segnalibri' },
  { name: 'flash', label: 'Lampo' },
  { name: 'heart', label: 'Cuore' },
  { name: 'star', label: 'Stella' },
  { name: 'gift', label: 'Regalo' },
  { name: 'basket', label: 'Cestino' },
  { name: 'airplane', label: 'Aereo' },
  { name: 'car', label: 'Auto' },
  { name: 'home', label: 'Casa' },
  { name: 'business', label: 'Lavoro' },
  { name: 'school', label: 'Scuola' },
  { name: 'fitness', label: 'Fitness' },
  { name: 'cafe', label: 'Caffè' },
  { name: 'musical-notes', label: 'Musica' },
  { name: 'camera', label: 'Fotocamera' },
  { name: 'mail', label: 'Email' },
  { name: 'chatbubble', label: 'Chat' },
];

export { FOLDER_COLORS, FOLDER_ICONS };

export function FolderModal({
  visible,
  mode,
  folder,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  visible: boolean;
  mode: 'create' | 'edit';
  folder?: FolderData;
  onClose: () => void;
  onCreate: (name: string, iconColor: string, icon: string) => void;
  onUpdate: (folderName: string, updates: Partial<FolderData>) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [iconColor, setIconColor] = useState(folder?.iconColor ?? FOLDER_COLORS[0]);
  const [icon, setIcon] = useState(folder?.icon ?? 'folder');

  useEffect(() => {
    if (visible) {
      setName(folder?.name ?? '');
      setIconColor(folder?.iconColor ?? FOLDER_COLORS[0]);
      setIcon(folder?.icon ?? 'folder');
    }
  }, [visible, folder?.name, folder?.iconColor, folder?.icon]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'create') {
      onCreate(trimmed, iconColor, icon);
    } else if (folder) {
      onUpdate(folder.name, { name: trimmed, iconColor, icon });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <View style={[styles.card, { zIndex: 1 }]}>
            <View style={styles.header}>
              <Text style={styles.title}>{mode === 'create' ? 'Nuova cartella' : 'Modifica cartella'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={24} color={THEME.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nome</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Es. Lavoro, Sport, Casa..."
              placeholderTextColor="#6b7280"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Colore</Text>
            <View style={styles.colorRow}>
              {FOLDER_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setIconColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, iconColor === c && styles.colorDotSelected]}
                />
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Icona</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScroll} contentContainerStyle={styles.iconRow}>
              {FOLDER_ICONS.map((ic) => (
                <TouchableOpacity
                  key={ic.name}
                  onPress={() => setIcon(ic.name)}
                  style={[styles.iconBtn, icon === ic.name && { backgroundColor: 'rgba(59,130,246,0.2)', borderColor: iconColor }]}
                >
                  <Ionicons name={ic.name as any} size={22} color={icon === ic.name ? iconColor : '#6b7280'} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.actions}>
              {mode === 'edit' && onDelete && (
                <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.deleteText}>Elimina</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={!name.trim()} style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}>
                <Text style={styles.saveText}>{mode === 'create' ? 'Crea' : 'Salva'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  keyboard: { width: '100%' },
  card: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: THEME.text },
  label: { fontSize: 14, fontWeight: '600', color: THEME.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: THEME.text,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorDotSelected: { borderColor: '#fff', transform: [{ scale: 1.1 }] },
  iconScroll: { marginHorizontal: -20 },
  iconRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 12 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  cancelText: { color: THEME.textMuted, fontSize: 16 },
  saveBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  saveBtnDisabled: { backgroundColor: '#374151', opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
