import { styles } from '@/components/index/indexStyles';
import { FOLDER_COLORS, FOLDER_ICONS, FolderItem } from '@/lib/index/indexTypes';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { THEME } from '@/constants/theme';

export type FolderModalsProps = {
  createFolderVisible: boolean;
  setCreateFolderVisible: (v: boolean) => void;
  editFolderVisible: boolean;
  setEditFolderVisible: (v: boolean) => void;
  editingFolder: FolderItem | null;
  setEditingFolder: (v: FolderItem | null) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  newFolderColor: string;
  setNewFolderColor: (v: string) => void;
  newFolderIcon: string;
  setNewFolderIcon: (v: string) => void;
  handleCreateFolder: () => void;
  handleSaveEditFolder: () => void;
  performDeleteFolder: (folderName: string) => void;
};

export function FolderModals(props: FolderModalsProps) {
  const {
    createFolderVisible,
    setCreateFolderVisible,
    editFolderVisible,
    setEditFolderVisible,
    editingFolder,
    setEditingFolder,
    newFolderName,
    setNewFolderName,
    newFolderColor,
    setNewFolderColor,
    newFolderIcon,
    setNewFolderIcon,
    handleCreateFolder,
    handleSaveEditFolder,
    performDeleteFolder,
  } = props;

  return (
    <>
      <Modal visible={editFolderVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Modifica cartella</Text>

                <Text style={styles.createFolderLabel}>Nome</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Es. Lavoro, Sport..."
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>Colore</Text>
                <View style={styles.createFolderRow}>
                  {FOLDER_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewFolderColor(c)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        newFolderColor === c && styles.colorSwatchSelected
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.createFolderLabel}>Icona</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                  {FOLDER_ICONS.map(i => (
                    <TouchableOpacity
                      key={i.name}
                      onPress={() => setNewFolderIcon(i.name)}
                      style={[
                        styles.iconOption,
                        newFolderIcon === i.name && [styles.iconOptionSelected, { borderColor: newFolderColor }]
                      ]}
                    >
                      <Ionicons name={i.name as any} size={24} color={newFolderIcon === i.name ? newFolderColor : THEME.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => {
                    if (editingFolder) {
                      Alert.alert('Elimina Cartella', `Vuoi eliminare la cartella "${editingFolder.name}"? (Le task torneranno in "Tutte")`, [
                        { text: 'Annulla', style: 'cancel' },
                        {
                          text: 'Elimina', style: 'destructive', onPress: () => {
                            performDeleteFolder(editingFolder.name);
                            setEditFolderVisible(false);
                            setEditingFolder(null);
                          }
                        }
                      ]);
                    }
                  }}
                  style={styles.editFolderDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.editFolderDeleteText}>Elimina cartella</Text>
                </TouchableOpacity>

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleSaveEditFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <Modal visible={createFolderVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateFolderVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Nuova cartella</Text>

                <Text style={styles.createFolderLabel}>Nome</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Es. Lavoro, Sport..."
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.createFolderLabel}>Colore</Text>
                <View style={styles.createFolderRow}>
                  {FOLDER_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewFolderColor(c)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        newFolderColor === c && styles.colorSwatchSelected
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.createFolderLabel}>Icona</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                  {FOLDER_ICONS.map(i => (
                    <TouchableOpacity
                      key={i.name}
                      onPress={() => setNewFolderIcon(i.name)}
                      style={[
                        styles.iconOption,
                        newFolderIcon === i.name && [styles.iconOptionSelected, { borderColor: newFolderColor }]
                      ]}
                    >
                      <Ionicons name={i.name as any} size={24} color={newFolderIcon === i.name ? newFolderColor : THEME.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => setCreateFolderVisible(false)}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Crea</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
