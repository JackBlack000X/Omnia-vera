import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function ShopScreen() {
  const router = useRouter();
  const { activeTheme, setActiveTheme } = useAppTheme();
  const [brightness, setBrightness] = React.useState(2);
  // Impostazioni salvate (non modificabili)
  const pointSpacing = 27;
  const thumbSize = 40;
  const thumbVerticalOffset = -3;
  const thumbHorizontalOffset = 16;
  const [isSliding, setIsSliding] = React.useState(false);
  const [sliderValue, setSliderValue] = React.useState(2);
  const [sliderWidth, setSliderWidth] = React.useState(0);
  const [showPositionPanel, setShowPositionPanel] = React.useState(false);
  // Offset laterali per ogni punto (1, 2, 3, 4)
  const [pointHorizontalOffsets, setPointHorizontalOffsets] = React.useState({
    1: 33,
    2: 0,
    3: -33,
    4: -65,
  });
  
  // Calcola l'offset orizzontale per allineare il controller al punto selezionato
  const calculateHorizontalOffset = () => {
    if (sliderWidth === 0) return thumbHorizontalOffset;
    
    const padding = 18 + pointSpacing;
    const availableWidth = sliderWidth - (padding * 2);
    
    // Usa sliderValue per il calcolo durante l'animazione
    const currentValue = sliderValue;
    
    // Posizione del thumb nello slider (0 = sinistra, 1 = destra)
    // Lo slider distribuisce uniformemente: 0%, 33.33%, 66.66%, 100%
    const thumbPosition = (currentValue - 1) / 3;
    const thumbPixelPosition = thumbPosition * sliderWidth;
    
    // Posizione del punto corrispondente (con space-between)
    // I punti sono distribuiti uniformemente nello spazio disponibile
    let pointPosition;
    if (currentValue === 1) {
      pointPosition = padding;
    } else if (currentValue === 4) {
      pointPosition = padding + availableWidth;
    } else {
      pointPosition = padding + ((currentValue - 1) * availableWidth / 3);
    }
    
    // Differenza tra posizione punto e posizione thumb
    const alignmentOffset = pointPosition - thumbPixelPosition;
    
    // Interpola l'offset tra i due punti più vicini per un movimento fluido
    const lowerPoint = Math.floor(currentValue);
    const upperPoint = Math.ceil(currentValue);
    const lowerOffset = pointHorizontalOffsets[lowerPoint as keyof typeof pointHorizontalOffsets] || 0;
    const upperOffset = pointHorizontalOffsets[upperPoint as keyof typeof pointHorizontalOffsets] || 0;
    const interpolation = currentValue - lowerPoint;
    const pointOffset = lowerOffset + (upperOffset - lowerOffset) * interpolation;
    
    return thumbHorizontalOffset + alignmentOffset + pointOffset;
  };

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
          {activeTheme !== 'futuristic' && <Text style={styles.title}>Shop</Text>}
          <View style={styles.headerRight}>
            <TouchableOpacity 
              onPress={() => setShowPositionPanel(!showPositionPanel)}
              style={styles.positionPanelToggle}
            >
              <Ionicons name="move-outline" size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/profile')}
              style={styles.profileBtn}
            >
              <Ionicons name="person-outline" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        
        {showPositionPanel && (
          <View style={styles.positionPanel}>
            <View style={styles.positionPanelHeader}>
              <Text style={styles.positionPanelTitle}>Posizione Laterale</Text>
              <TouchableOpacity
                onPress={() => setShowPositionPanel(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={18} color="white" />
              </TouchableOpacity>
            </View>
            {[1, 2, 3, 4].map((point) => (
              <View key={point} style={styles.positionControlRow}>
                <Text style={styles.positionControlLabel}>Punto {point}</Text>
                <View style={styles.positionControlValue}>
                  <Text style={styles.positionControlValueText}>
                    {pointHorizontalOffsets[point as keyof typeof pointHorizontalOffsets]}
                  </Text>
                </View>
                <Slider
                  style={styles.positionSlider}
                  minimumValue={-100}
                  maximumValue={100}
                  step={1}
                  value={pointHorizontalOffsets[point as keyof typeof pointHorizontalOffsets]}
                  onValueChange={(value) => {
                    setPointHorizontalOffsets(prev => ({
                      ...prev,
                      [point]: value
                    }));
                  }}
                  minimumTrackTintColor="#ffffff"
                  maximumTrackTintColor="rgba(255,255,255,0.2)"
                  thumbTintColor="#ffffff"
                />
              </View>
            ))}
          </View>
        )}
        
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

          <View style={styles.brightnessContainer}>
            <View style={styles.brightnessHeader}>
              <Text style={styles.brightnessLabel}>Luminosità</Text>
              <Text style={styles.brightnessValue}>{brightness}</Text>
            </View>
            
            <View style={styles.sliderWrapper}>
              <View 
                style={styles.brightnessSlider}
                onLayout={(event) => {
                  const { width } = event.nativeEvent.layout;
                  setSliderWidth(width);
                }}
              >
                <View style={[
                  {
                    transform: [
                      { scale: thumbSize / 20 },
                      { translateY: thumbVerticalOffset },
                      { translateX: calculateHorizontalOffset() }
                    ]
                  }
                ]}>
                  <Slider
                    style={styles.brightnessSlider}
                    minimumValue={1}
                    maximumValue={4}
                    step={0}
                    tapToSeek={true}
                    value={sliderValue}
                    onValueChange={(value) => {
                      setSliderValue(value);
                      // Aggiorna anche brightness durante il movimento per feedback immediato
                      const rounded = Math.round(value);
                      if (rounded !== brightness) {
                        setBrightness(rounded);
                      }
                    }}
                    onSlidingStart={() => {
                      setIsSliding(true);
                    }}
                    onSlidingComplete={(value) => {
                      const rounded = Math.round(value);
                      setIsSliding(false);
                      // Animazione fluida verso il valore arrotondato con easing
                      const startValue = value;
                      const targetValue = rounded;
                      const duration = 300; // ms
                      const startTime = Date.now();
                      
                      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
                      
                      const animate = () => {
                        const elapsed = Date.now() - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        const eased = easeOutCubic(progress);
                        const currentValue = startValue + (targetValue - startValue) * eased;
                        
                        setSliderValue(currentValue);
                        
                        if (progress < 1) {
                          requestAnimationFrame(animate);
                        } else {
                          setSliderValue(targetValue);
                          setBrightness(targetValue);
                        }
                      };
                      requestAnimationFrame(animate);
                    }}
                    minimumTrackTintColor="transparent"
                    maximumTrackTintColor="transparent"
                    thumbTintColor="rgba(255, 255, 255, 0.5)"
                  />
                </View>
              </View>
              <View style={[
                styles.sliderPoints,
                { paddingHorizontal: 18 + pointSpacing }
              ]}>
                {[1, 2, 3, 4].map((point) => (
                  <View
                    key={point}
                    style={[
                      styles.sliderPoint,
                      brightness === point && styles.sliderPointActive,
                    ]}
                  />
                ))}
              </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  positionPanelToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
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
  brightnessContainer: {
    marginTop: 32,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 15, 15, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  brightnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderWrapper: {
    position: 'relative',
  },
  brightnessLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  brightnessValue: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  brightnessSlider: {
    width: '100%',
    height: 56,
  },
  sliderPoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: -40,
    position: 'relative',
  },
  sliderPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  sliderPointActive: {
    backgroundColor: '#ffffff',
    width: 10,
    height: 10,
    borderRadius: 5,
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
  positionPanel: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 200,
    backgroundColor: 'rgba(15, 15, 15, 0.95)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  positionPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  positionPanelTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  positionControlRow: {
    marginBottom: 12,
  },
  positionControlLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  positionControlValue: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  positionControlValueText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  positionSlider: {
    width: '100%',
    height: 24,
  },
});
