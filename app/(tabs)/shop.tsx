import { useHabits } from '@/lib/habits/Provider';
import { getItemWithLegacy, LEGACY_STORAGE_KEYS, STORAGE_KEYS } from '@/lib/storageKeys';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COINS_PER_STREAK_DAY = 100;
const FUTURISTIC_THEME_COST = 700;
const STORAGE_COINS_SPENT = STORAGE_KEYS.shopCoinsSpent;
const STORAGE_FUTURISTIC_UNLOCKED = STORAGE_KEYS.shopFuturisticUnlocked;

export default function ShopScreen() {
  const router = useRouter();
  const { activeTheme, setActiveTheme } = useAppTheme();
  const { history } = useHabits();

  const [coinsSpent, setCoinsSpent] = useState(0);
  const [isFuturisticUnlocked, setIsFuturisticUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawSpent, rawUnlocked] = await Promise.all([
          getItemWithLegacy(STORAGE_COINS_SPENT, LEGACY_STORAGE_KEYS.shopCoinsSpent),
          getItemWithLegacy(STORAGE_FUTURISTIC_UNLOCKED, LEGACY_STORAGE_KEYS.shopFuturisticUnlocked),
        ]);
        if (rawSpent && !Number.isNaN(Number(rawSpent))) {
          setCoinsSpent(Number(rawSpent));
        }
        if (rawUnlocked === '1') {
          setIsFuturisticUnlocked(true);
        }
      } catch (e) {
        console.warn('Failed to load shop state', e);
      }
    })();
  }, []);

  const earnedCoins = useMemo(() => {
    const activeDays = Object.keys(history).filter(k =>
      Object.values(history[k]?.completedByHabitId ?? {}).some(Boolean)
    ).length;
    return activeDays * COINS_PER_STREAK_DAY;
  }, [history]);

  const coins = useMemo(() => {
    const available = earnedCoins - coinsSpent;
    return available > 0 ? available : 0;
  }, [earnedCoins, coinsSpent]);

  const canUnlockFuturistic = !isFuturisticUnlocked && coins >= FUTURISTIC_THEME_COST;
  const missingCoins = !isFuturisticUnlocked && coins < FUTURISTIC_THEME_COST
    ? FUTURISTIC_THEME_COST - coins
    : 0;

  const handleUnlockFuturistic = () => {
    if (isFuturisticUnlocked || !canUnlockFuturistic) return;
    Alert.alert(
      'Sblocca tema futuristico',
      `Vuoi spendere ${FUTURISTIC_THEME_COST} coins per sbloccare il tema Futuristic Computer?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sblocca',
          onPress: async () => {
            const newSpent = coinsSpent + FUTURISTIC_THEME_COST;
            setIsFuturisticUnlocked(true);
            setCoinsSpent(newSpent);
            setActiveTheme('futuristic');
            try {
              await Promise.all([
                AsyncStorage.setItem(STORAGE_FUTURISTIC_UNLOCKED, '1'),
                AsyncStorage.setItem(STORAGE_COINS_SPENT, String(newSpent)),
              ]);
            } catch (e) {
              console.warn('Failed to persist shop unlock state', e);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
          {activeTheme !== 'futuristic' && <Text style={styles.title}>Shop</Text>}
          <View style={styles.coinsWrap}>
            <View style={styles.coinSymbol}>
              <Text style={styles.coinSymbolText}>C</Text>
            </View>
            <Text style={styles.coinsText}>{coins}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              onPress={() => router.push('/profile')}
              style={styles.profileBtn}
            >
              <Ionicons name="person-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.content}>
          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={[styles.optionButton, activeTheme === 'classic' && styles.activeOption]} 
              activeOpacity={0.8}
              onPress={() => setActiveTheme('classic')}
            >
              <Text style={styles.optionText}>Classic</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.optionButton,
                activeTheme === 'futuristic' && isFuturisticUnlocked && styles.activeOption,
                !isFuturisticUnlocked && !canUnlockFuturistic && styles.lockedOption,
                !isFuturisticUnlocked && canUnlockFuturistic && styles.unlockableOption,
              ]} 
              activeOpacity={0.8}
              onPress={() => {
                if (isFuturisticUnlocked) {
                  setActiveTheme('futuristic');
                  return;
                }
                if (canUnlockFuturistic) {
                  handleUnlockFuturistic();
                  return;
                }
                Alert.alert(
                  'Tema bloccato',
                  `Ti servono ancora ${missingCoins} coins per sbloccare il tema Futuristic Computer.`,
                );
              }}
            >
              <View style={styles.optionContentRow}>
                {!isFuturisticUnlocked && (
                  <Ionicons
                    name="lock-closed-outline"
                    size={24}
                    color="white"
                    style={{ marginRight: 10 }}
                  />
                )}
                <View>
                  <Text style={styles.optionText}>
                    {isFuturisticUnlocked
                      ? 'Futuristic Computer'
                      : canUnlockFuturistic
                        ? `Sblocca Futuristic Computer (${FUTURISTIC_THEME_COST} C)`
                        : 'Futuristic Computer (Bloccato)'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 20,
  },
  coinsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  coinSymbol: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fbbf24',
  },
  coinSymbolText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  coinsText: {
    color: '#fbbf24',
    fontSize: 17,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  optionsContainer: {
    gap: 16,
    width: '100%',
  },
  optionButton: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'white',
  },
  lockedOption: {
    opacity: 0.65,
  },
  unlockableOption: {
    borderColor: '#fbbf24',
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  optionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  optionSubText: {
    marginTop: 4,
    color: '#e5e7eb',
    fontSize: 13,
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 18,
  },
});
