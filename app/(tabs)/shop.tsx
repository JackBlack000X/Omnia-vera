import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ShopScreen() {
  const router = useRouter();

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Shop</Text>
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
            <TouchableOpacity style={styles.optionButton} activeOpacity={0.8} onPress={() => {}}>
              <View style={styles.optionContentRow}>
                <Ionicons
                  name="time-outline"
                  size={24}
                  color="white"
                  style={{ marginRight: 10 }}
                />
                <View>
                  <Text style={styles.optionText}>other desins coming soon</Text>
                  <Text style={styles.optionSubText}>Classic design is the only available option for now.</Text>
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
});
