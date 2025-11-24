import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { useAppTheme } from '@/lib/theme-context';

const PIXEL_SIZE = 0.625;
const NOISE_INTENSITY = 31.0;

const noiseShaderSource = `
  uniform float threshold;
  uniform float2 resolution;
  uniform float4 noiseColor;
  uniform float4 backgroundColor;
  
  // High-quality hash function to eliminate patterns (Gold Noise)
  float random(vec2 st) {
      float phi = 1.61803398874989484820459; 
      return fract(tan(distance(st * phi, st) * 123.456) * st.x);
  }

  vec4 main(vec2 pos) {
      // Quantize position to create "pixels"
      vec2 gridPos = floor(pos / ${PIXEL_SIZE});
      float r = random(gridPos);
      
      if (r * 100.0 < threshold) {
          return noiseColor;
      } else {
          return backgroundColor;
      }
  }
`;

export function NoiseBackground() {
  const { activeTheme } = useAppTheme();
  const { width, height } = useWindowDimensions();

  const noiseShader = useMemo(() => Skia.RuntimeEffect.Make(noiseShaderSource), []);

  const themeColors = useMemo(() => {
      return {
        // Futuristic Computer
        noise: [0.2, 0.2, 0.2, 1.0], // Lighter Grey (Noise)
        background: [0.07, 0.07, 0.07, 1.0], // Very Dark Grey (Background)
      };
  }, []);

  if (activeTheme !== 'futuristic') {
    return null;
  }

  if (!noiseShader) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ flex: 1 }} mode="continuous">
        <Fill>
          <Shader 
            source={noiseShader} 
            uniforms={{ 
              threshold: NOISE_INTENSITY, 
              resolution: [width, height],
              noiseColor: themeColors.noise,
              backgroundColor: themeColors.background,
            }} 
          />
        </Fill>
      </Canvas>
    </View>
  );
}

