import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ShopScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('shop.title')}</Text>
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
            <View style={styles.optionGroup}>
              <TouchableOpacity style={styles.optionButton} activeOpacity={0.86} onPress={() => {}}>
                <GlassView
                  glassEffectStyle="regular"
                  colorScheme="dark"
                  isInteractive
                  style={styles.optionGlass}
                >
                  <Text style={styles.optionText}>{t('shop.themesSoon')}</Text>
                  <View style={styles.optionArrowBubble}>
                    <Ionicons name="arrow-forward" size={16} color="white" />
                  </View>
                </GlassView>
              </TouchableOpacity>
              <Text style={styles.optionSubText}>{t('shop.themesSub')}</Text>
            </View>
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
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 15,
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
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  optionsContainer: {
    gap: 16,
    width: '100%',
    alignItems: 'center',
  },
  optionGroup: {
    alignItems: 'center',
    gap: 12,
  },
  optionButton: {
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 12,
    },
  },
  optionGlass: {
    minHeight: 64,
    minWidth: 272,
    paddingVertical: 10,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    overflow: 'hidden',
  },
  optionArrowBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optionText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    flexShrink: 1,
  },
  optionSubText: {
    color: '#e5e7eb',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 300,
  },
});
