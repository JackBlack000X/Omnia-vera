import { THEME } from '@/constants/theme';
import { Place, loadPlaces, savePlaces } from '@/lib/places';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { canAskLocationPermission, requestLocationPermissionsAsync } from '@/lib/location';

const EDIT_ICON_CENTERING = { transform: [{ translateX: 2 }, { translateY: -2 }] } as const;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export default function PlacesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [places, setPlaces] = useState<Place[]>([]);
  const [editing, setEditing] = useState<Place | null>(null);
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('200');
  const [address, setAddress] = useState('');
  const [addressSearch, setAddressSearch] = useState('');

  useEffect(() => {
    (async () => {
      const loaded = await loadPlaces();
      setPlaces(loaded);
      if (loaded.length > 0) {
        const first = loaded[0];
        setLat(String(first.lat));
        setLng(String(first.lng));
        try {
          const res = await Location.reverseGeocodeAsync({ latitude: first.lat, longitude: first.lng });
          if (res[0]) {
            const r = res[0];
            setAddress([r.street, r.city, r.country].filter(Boolean).join(', '));
          }
        } catch {}
      } else if (canAskLocationPermission()) {
        try {
          const status = await requestLocationPermissionsAsync('foreground');
          if (status === 'foreground') {
            const pos = await Location.getCurrentPositionAsync({});
            setLat(String(pos.coords.latitude));
            setLng(String(pos.coords.longitude));
          }
        } catch {}
      }
    })();
  }, []);

  async function persist(next: Place[]) {
    setPlaces(next);
    await savePlaces(next);
  }

  function startNew() {
    setEditing(null);
    setName('');
    setLat('');
    setLng('');
    setRadius('200');
    setAddress('');
  }

  function startEdit(p: Place) {
    setEditing(p);
    setName(p.name);
    setLat(String(p.lat));
    setLng(String(p.lng));
    setRadius(String(p.radiusMeters));
    (async () => {
      try {
        const res = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
        if (res[0]) {
          const r = res[0];
          setAddress([r.street, r.city, r.country].filter(Boolean).join(', '));
        }
      } catch {
        setAddress('');
      }
    })();
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const latNum = Number(lat.replace(',', '.'));
    const lngNum = Number(lng.replace(',', '.'));
    const radiusNum = Number(radius.replace(',', '.'));

    if (!trimmedName) {
      Alert.alert(t('places.alertTitle'), t('places.nameRequired'));
      return;
    }
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      Alert.alert(t('places.alertTitle'), t('places.coordsInvalid'));
      return;
    }
    if (!Number.isFinite(radiusNum) || radiusNum <= 0) {
      Alert.alert(t('places.alertTitle'), t('places.radiusInvalid'));
      return;
    }

    if (editing) {
      const next = places.map(p =>
        p.id === editing.id ? { ...p, name: trimmedName, lat: latNum, lng: lngNum, radiusMeters: radiusNum } : p
      );
      await persist(next);
    } else {
      const next: Place = {
        id: generateId(),
        name: trimmedName,
        lat: latNum,
        lng: lngNum,
        radiusMeters: radiusNum,
      };
      await persist([...places, next]);
    }
    startNew();
  }

  async function handleSearchAddress() {
    const query = addressSearch.trim();
    if (!query) return;
    try {
      const results = await Location.geocodeAsync(query);
      if (!results || results.length === 0) {
        Alert.alert(t('places.addressTitle'), t('places.addressNotFound'));
        return;
      }
      const best = results[0];
      setLat(String(best.latitude));
      setLng(String(best.longitude));
      setAddress(query);
    } catch {
      Alert.alert(t('places.addressTitle'), t('places.addressSearchError'));
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(
      t('places.deleteTitle'),
      t('places.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const next = places.filter(p => p.id !== id);
            await persist(next);
            if (editing && editing.id === id) startNew();
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={THEME.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('places.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.formBox}>
        <Text style={styles.sectionTitle}>{editing ? t('places.editPlace') : t('places.newPlace')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('places.namePh')}
          placeholderTextColor={THEME.textMuted}
          value={name}
          onChangeText={setName}
        />
        <View style={styles.row}>
          <View style={styles.coordColumn}>
            <Text style={styles.label}>{t('places.searchAddress')}</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t('places.addressPh')}
                placeholderTextColor={THEME.textMuted}
                value={addressSearch}
                onChangeText={setAddressSearch}
                onSubmitEditing={handleSearchAddress}
              />
              <TouchableOpacity style={styles.searchBtn} onPress={handleSearchAddress}>
                <Ionicons name="search-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {address ? (
          <Text style={styles.addressText} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        <View style={styles.row}>
          <View style={styles.coordColumn}>
            <Text style={styles.label}>{t('places.lat')}</Text>
            <TextInput
              style={styles.input}
              placeholder="46.0"
              placeholderTextColor={THEME.textMuted}
              keyboardType="decimal-pad"
              value={lat}
              onChangeText={setLat}
            />
          </View>
          <View style={styles.coordColumn}>
            <Text style={styles.label}>{t('places.lng')}</Text>
            <TextInput
              style={styles.input}
              placeholder="8.0"
              placeholderTextColor={THEME.textMuted}
              keyboardType="decimal-pad"
              value={lng}
              onChangeText={setLng}
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.coordColumn}>
            <Text style={styles.label}>{t('places.radius')}</Text>
            <TextInput
              style={styles.input}
              placeholder="200"
              placeholderTextColor={THEME.textMuted}
              keyboardType="number-pad"
              value={radius}
              onChangeText={setRadius}
            />
          </View>
        </View>
        <View style={styles.formButtons}>
          {editing && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={startNew}>
              <Text style={styles.secondaryBtnText}>{t('places.cancelEdit')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
            <Text style={styles.primaryBtnText}>{editing ? t('places.save') : t('places.add')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.listBox}>
        <Text style={styles.sectionTitle}>{t('places.saved')}</Text>
        {places.length === 0 ? (
          <Text style={styles.emptyText}>
            {t('places.empty')}
          </Text>
        ) : (
          <FlatList
            data={places}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => (
              <View style={styles.placeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{item.name}</Text>
                  <Text style={styles.placeMeta}>
                    {t('places.radiusMeta', {
                      lat: item.lat.toFixed(4),
                      lng: item.lng.toFixed(4),
                      m: Math.round(item.radiusMeters),
                    })}
                  </Text>
                </View>
                <View style={styles.placeActions}>
                  <TouchableOpacity onPress={() => startEdit(item)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color={THEME.text} style={EDIT_ICON_CENTERING} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item.id)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color="#f97373" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.background, paddingHorizontal: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { color: THEME.text, fontSize: 24, fontWeight: '700' },
  formBox: {
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  listBox: {
    flex: 1,
    backgroundColor: '#020617',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  sectionTitle: { color: THEME.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  addressText: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(15,23,42,0.9)',
    color: THEME.text,
    fontSize: 13,
  },
  addressTextMuted: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(15,23,42,0.9)',
    color: THEME.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: '#020617',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    marginTop: 6,
  },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  coordColumn: { flex: 1 },
  label: { color: THEME.textMuted, fontSize: 13 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  primaryBtn: {
    backgroundColor: '#1d4ed8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  secondaryBtnText: { color: THEME.textMuted, fontWeight: '600' },
  emptyText: { color: THEME.textMuted, marginTop: 8, fontSize: 14 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  placeName: { color: THEME.text, fontSize: 16, fontWeight: '600' },
  placeMeta: { color: THEME.textMuted, fontSize: 13, marginTop: 2 },
  placeActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
