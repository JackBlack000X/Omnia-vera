import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/lib/theme-context';

export default function ShopScreen() {
  const router = useRouter();
  const { activeTheme, setActiveTheme } = useAppTheme();

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
          {activeTheme !== 'futuristic' && <Text style={styles.title}>Shop</Text>}
          <TouchableOpacity 
            onPress={() => router.push('/profile')}
            style={styles.profileBtn}
          >
            <Ionicons name="person-outline" size={24} color="white" />
          </TouchableOpacity>
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
              style={[styles.optionButton, activeTheme === 'futuristic' && styles.activeOption]} 
              activeOpacity={0.8}
              onPress={() => setActiveTheme('futuristic')}
            >
              <Text style={styles.optionText}>Futuristic Computer</Text>
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
    // If theme is classic, background is black. If futuristic, background is handled by global NoiseBackground.
    // But NoiseBackground is "absoluteFill" in root layout.
    // So this View background should be transparent or handled conditionally if needed.
    // Actually, for 'futuristic' the global background is visible.
    // For 'classic', we might want a solid black background locally or globally.
    // Let's keep transparent here and let global components handle it?
    // Wait, if 'classic' is selected, NoiseBackground renders nothing (transparent).
    // So we need a black background somewhere.
    // Let's make this transparent and rely on a global black background fallback or handle it in NoiseBackground.
    // Simpler: Make this transparent, and ensure RootLayout has a black fallback.
    // Or just set backgroundColor here based on theme? No, theme is global.
    // Let's leave it transparent but ensure the app background is black by default.
    backgroundColor: 'transparent', 
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
  activeOption: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'white',
  },
  optionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 18,
  },
});
