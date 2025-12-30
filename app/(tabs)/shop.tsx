import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TEST_SLIDER_SCALE = 2.028;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// Soglia "più vicino": cambia punto solo quando superi la metà verso il prossimo (no drop in mezzo)
const TEST_HYSTERESIS_THRESHOLD = 0.5;

export default function ShopScreen() {
  const router = useRouter();
  const { activeTheme, setActiveTheme } = useAppTheme();
  const [testValue, setTestValue] = React.useState(2);
  const [test2Value, setTest2Value] = React.useState(5);
  const [test3Value, setTest3Value] = React.useState(5);
  const [test4Value, setTest4Value] = React.useState(5);
  const [test5Value, setTest5Value] = React.useState(5);
  const [test6Value, setTest6Value] = React.useState(5);
  const testSliderRef = React.useRef<any>(null);
  const testStepRef = React.useRef<number>(2); // valore "tac tac" corrente (1..4)
  const testReleaseRafRef = React.useRef<number | null>(null);
  // Impostazioni salvate (non modificabili)
  const pointSpacing = 27;

  // Menu impostazioni Test 2
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [slider1Width, setSlider1Width] = React.useState(10); // % per il primo slider
  const [slider2Width, setSlider2Width] = React.useState(30); // px per il secondo slider
  const [slider3Width, setSlider3Width] = React.useState(10); // px per il terzo slider
  const [slider4Width, setSlider4Width] = React.useState(30); // px per il quarto slider
  const [slidersGap, setSlidersGap] = React.useState(30); // gap tra i due slider
  const [slider1Margin, setSlider1Margin] = React.useState(0); // distanza dal bordo sinistro

  // Menu impostazioni slider centrato
  const [centeredSliderMenuVisible, setCenteredSliderMenuVisible] = React.useState(false);
  const [centeredSliderWidth, setCenteredSliderWidth] = React.useState(100); // larghezza slider centrato
  const [activeThumbSize, setActiveThumbSize] = React.useState(1); // scala del thumb attivo (1 = normale)
  const [isCenteredSliderActive, setIsCenteredSliderActive] = React.useState(false);

  const applyTestStepToNative = (step: number) => {
    const v = clamp(step, 1, 4);
    // Web: updateValue, Native: setNativeProps
    testSliderRef.current?.updateValue?.(v);
    testSliderRef.current?.setNativeProps?.({ value: v });
  };

  return (
    <View style={styles.background}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 60 }]}>
          {activeTheme !== 'futuristic' && <Text style={styles.title}>Shop</Text>}
          <View style={styles.headerRight}>
            <TouchableOpacity 
              onPress={() => setMenuVisible(true)}
              style={styles.profileBtn}
            >
              <Ionicons name="settings-outline" size={22} color="white" />
            </TouchableOpacity>
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
              style={[styles.optionButton, activeTheme === 'futuristic' && styles.activeOption]} 
              activeOpacity={0.8}
              onPress={() => setActiveTheme('futuristic')}
            >
              <Text style={styles.optionText}>Futuristic Computer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.testContainer}>
            <View style={[styles.brightnessHeader, styles.testHeader]}>
              <Text style={[styles.brightnessLabel, styles.testLabel]}>Test</Text>
              <Text style={[styles.brightnessValue, styles.testValueText]}>{testValue}</Text>
            </View>
            
            <View style={[styles.testSliderWrapper, { paddingHorizontal: 18 + pointSpacing - 17.5 }]}>
              <Slider
                ref={testSliderRef}
                style={styles.testSlider}
                minimumValue={1}
                maximumValue={4}
                step={0}
                value={testValue}
                onSlidingStart={() => {
                  // Aggancia il controller al valore corrente (niente drop in mezzo)
                  testStepRef.current = clamp(Math.round(testValue), 1, 4);
                  if (testReleaseRafRef.current !== null) {
                    cancelAnimationFrame(testReleaseRafRef.current);
                    testReleaseRafRef.current = null;
                  }
                  applyTestStepToNative(testStepRef.current);
                }}
                onValueChange={(val) => {
                  // Resta sul punto corrente finché non sei più vicino al prossimo (soglia 0.5)
                  const raw = clamp(val, 1, 4);
                  let current = testStepRef.current;

                  while (current < 4 && raw >= current + TEST_HYSTERESIS_THRESHOLD) current += 1;
                  while (current > 1 && raw <= current - TEST_HYSTERESIS_THRESHOLD) current -= 1;

                  if (current !== testStepRef.current) {
                    testStepRef.current = current;
                    setTestValue(current);
                  }

                  // Mantieni SEMPRE il thumb sul punto corrente (tac tac, niente valori intermedi)
                  applyTestStepToNative(testStepRef.current);
                }}
                onResponderRelease={() => {
                  // Forza il valore nel momento ESATTO del rilascio (evita che resti in mezzo)
                  const current = clamp(Math.round(testStepRef.current), 1, 4);
                  testStepRef.current = current;
                  applyTestStepToNative(current);
                  setTestValue(current);

                  // Re-applica al frame successivo per vincere eventuali "finalize" interni del native slider
                  if (testReleaseRafRef.current !== null) {
                    cancelAnimationFrame(testReleaseRafRef.current);
                  }
                  testReleaseRafRef.current = requestAnimationFrame(() => {
                    applyTestStepToNative(current);
                    testReleaseRafRef.current = null;
                  });
                }}
                onSlidingComplete={() => {
                  const current = clamp(Math.round(testStepRef.current), 1, 4);
                  testStepRef.current = current;
                  applyTestStepToNative(current);
                  setTestValue(current);
                }}
                minimumTrackTintColor="rgba(255,255,255,0.1)"
                maximumTrackTintColor="rgba(255,255,255,0.1)"
                thumbTintColor="rgba(255,255,255,0.3)"
              />

              <View style={styles.testPoints}>
                {[1, 2, 3, 4].map((point) => (
                  <View
                    key={point}
                    style={[
                      styles.testPoint,
                      Math.round(testValue) === point && styles.testPointActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.testContainer}>
            <View style={[styles.brightnessHeader, styles.testHeader]}>
              <Text style={[styles.brightnessLabel, styles.testLabel]}>Test 2</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={[styles.brightnessValue, styles.testValueText]}>{Math.round(test2Value)}</Text>
                <TouchableOpacity 
                  onPress={() => setCenteredSliderMenuVisible(true)}
                  style={styles.settingsIconBtn}
                >
                  <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={[styles.testSliderWrapper, { flexDirection: 'row', alignItems: 'center', gap: slidersGap, marginLeft: slider1Margin }]}>
              <Slider
                style={[styles.simpleSliderBase, { width: slider1Width / TEST_SLIDER_SCALE }]}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={test2Value}
                onValueChange={setTest2Value}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.1)"
                thumbTintColor="rgba(255,255,255,0.3)"
              />
              <Slider
                style={[styles.simpleSliderBase, { width: slider2Width / TEST_SLIDER_SCALE }]}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={test3Value}
                onValueChange={setTest3Value}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.1)"
                thumbTintColor="rgba(255,255,255,0.3)"
              />
              <Slider
                style={[styles.simpleSliderBase, { width: slider3Width / TEST_SLIDER_SCALE }]}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={test4Value}
                onValueChange={setTest4Value}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.1)"
                thumbTintColor="rgba(255,255,255,0.3)"
              />
              <Slider
                style={[styles.simpleSliderBase, { width: slider4Width / TEST_SLIDER_SCALE }]}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={test5Value}
                onValueChange={setTest5Value}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.1)"
                thumbTintColor="rgba(255,255,255,0.3)"
              />
            </View>

            <View style={[styles.testSliderWrapper, { alignItems: 'center', marginTop: 20 }]}>
              <View style={isCenteredSliderActive && { transform: [{ scale: activeThumbSize }] }}>
                <Slider
                  style={[styles.simpleSliderBase, { width: centeredSliderWidth }]}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={test6Value}
                  onSlidingStart={() => setIsCenteredSliderActive(true)}
                  onSlidingComplete={() => setIsCenteredSliderActive(false)}
                  onValueChange={setTest6Value}
                  minimumTrackTintColor="#ffffff"
                  maximumTrackTintColor="rgba(255,255,255,0.1)"
                  thumbTintColor="rgba(255,255,255,0.3)"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Menu impostazioni Test 2 */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setMenuVisible(false)}
          >
            <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
              <Text style={styles.menuTitle}>Impostazioni Test 2</Text>
              
              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Larghezza Slider 1</Text>
                <Text style={styles.menuValue}>{slider1Width}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={10}
                maximumValue={200}
                step={1}
                value={slider1Width}
                onValueChange={setSlider1Width}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Distanza da bordo Slider 1</Text>
                <Text style={styles.menuValue}>{slider1Margin}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={0}
                maximumValue={150}
                step={1}
                value={slider1Margin}
                onValueChange={setSlider1Margin}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Larghezza Slider 2</Text>
                <Text style={styles.menuValue}>{slider2Width}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={10}
                maximumValue={200}
                step={1}
                value={slider2Width}
                onValueChange={setSlider2Width}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Larghezza Slider 3</Text>
                <Text style={styles.menuValue}>{slider3Width}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={10}
                maximumValue={200}
                step={1}
                value={slider3Width}
                onValueChange={setSlider3Width}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Larghezza Slider 4</Text>
                <Text style={styles.menuValue}>{slider4Width}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={10}
                maximumValue={200}
                step={1}
                value={slider4Width}
                onValueChange={setSlider4Width}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Distanza tra slider</Text>
                <Text style={styles.menuValue}>{slidersGap}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={slidersGap}
                onValueChange={setSlidersGap}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <TouchableOpacity 
                style={styles.menuCloseBtn}
                onPress={() => setMenuVisible(false)}
              >
                <Text style={styles.menuCloseBtnText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Menu impostazioni slider centrato */}
        <Modal
          visible={centeredSliderMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCenteredSliderMenuVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setCenteredSliderMenuVisible(false)}
          >
            <View style={styles.menuContainer} onStartShouldSetResponder={() => true}>
              <Text style={styles.menuTitle}>Impostazioni Slider Centrato</Text>
              
              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Larghezza Slider</Text>
                <Text style={styles.menuValue}>{centeredSliderWidth}px</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={50}
                maximumValue={300}
                step={1}
                value={centeredSliderWidth}
                onValueChange={setCenteredSliderWidth}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <View style={styles.menuRow}>
                <Text style={styles.menuLabel}>Dimensione Thumb Attivo</Text>
                <Text style={styles.menuValue}>{activeThumbSize.toFixed(1)}x</Text>
              </View>
              <Slider
                style={styles.menuSlider}
                minimumValue={0.5}
                maximumValue={2.5}
                step={0.1}
                value={activeThumbSize}
                onValueChange={setActiveThumbSize}
                minimumTrackTintColor="#ffffff"
                maximumTrackTintColor="rgba(255,255,255,0.3)"
                thumbTintColor="#ffffff"
              />

              <TouchableOpacity 
                style={styles.menuCloseBtn}
                onPress={() => setCenteredSliderMenuVisible(false)}
              >
                <Text style={styles.menuCloseBtnText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ff0000',
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
  testContainer: {
    marginTop: 21,
    paddingVertical: 21,
    paddingHorizontal: 23,
    borderRadius: 21,
    backgroundColor: 'rgba(15, 15, 15, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  testHeader: {
    marginBottom: 10,
  },
  testLabel: {
    fontSize: 21,
  },
  testValueText: {
    fontSize: 21,
  },
  testSliderWrapper: {
    paddingVertical: 6,
  },
  testSlider: {
    width: '49.31%',
    height: 40,
    alignSelf: 'center',
    transform: [{ scale: TEST_SLIDER_SCALE }],
  },
  simpleSliderBase: {
    height: 40,
    transform: [{ scale: TEST_SLIDER_SCALE }],
  },
  testSliderShort: {
    width: '24%',
  },
  testPoints: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 14,
  },
  testPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  testPointActive: {
    backgroundColor: '#ffffff',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  brightnessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  settingsIconBtn: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    width: '85%',
    backgroundColor: 'rgba(25, 25, 25, 0.98)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  menuTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  menuLabel: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
  menuValue: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 15,
  },
  menuSlider: {
    width: '100%',
    height: 40,
    marginTop: 4,
  },
  menuCloseBtn: {
    marginTop: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  menuCloseBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
