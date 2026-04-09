import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { THEME } from '@/constants/theme';

const ICON_SCALE = 0.66;
const BUTTON_WIDTH = 24 * ICON_SCALE;
const RIGHT_EXTENSION = 4 * ICON_SCALE;
const ICON_WIDTH = BUTTON_WIDTH + RIGHT_EXTENSION;
const ICON_HEIGHT = 30 * ICON_SCALE;
const DEBUG_COLOR = THEME.green;
const ICON_TRANSLATE_X = 0;
const STEM_RIGHT_PADDING = 4 * ICON_SCALE;
const STEM_WIDTH_MIN = 2 * ICON_SCALE;
const STEM_WIDTH_MAX = 2 * ICON_SCALE;
const STEM_HEIGHT_MIN = 8.5 * ICON_SCALE;
const STEM_HEIGHT_MAX = 14 * ICON_SCALE;
const ARM_HEIGHT = 2 * ICON_SCALE;
const ARM_LENGTH_MAX = STEM_HEIGHT_MAX / 2;

type Props = {
  progress: number;
};

export const MORPHING_FOLDER_ADD_ICON_WIDTH = ICON_WIDTH;
export const MORPHING_FOLDER_ADD_ICON_HEIGHT = ICON_HEIGHT;
export const MORPHING_FOLDER_ADD_FIRST_PIXEL_OFFSET =
  ((BUTTON_WIDTH - ICON_WIDTH) / 2) + ICON_TRANSLATE_X + (BUTTON_WIDTH - STEM_RIGHT_PADDING - STEM_WIDTH_MIN);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export const MorphingFolderAddIcon = React.memo(function MorphingFolderAddIcon({ progress }: Props) {
  const geometry = useMemo(() => {
    const t = clamp01(progress);
    const stemPhase = smoothStep(clamp01((t + 0.04) / 0.42));
    const leftArmPhase = smoothStep(clamp01((t - 0.08) / 0.42));

    const stemWidth = STEM_WIDTH_MIN + (STEM_WIDTH_MAX - STEM_WIDTH_MIN) * stemPhase;
    const stemHeight = STEM_HEIGHT_MIN + (STEM_HEIGHT_MAX - STEM_HEIGHT_MIN) * stemPhase;
    const stemLeft = BUTTON_WIDTH - STEM_RIGHT_PADDING - stemWidth;
    const stemTop = (ICON_HEIGHT - stemHeight) / 2;
    const stemCenter = stemLeft + stemWidth / 2;
    const armWidth = Math.max(0, ARM_LENGTH_MAX * leftArmPhase);
    const armTop = (ICON_HEIGHT - ARM_HEIGHT) / 2;

    return {
      stemWidth,
      stemHeight,
      stemLeft,
      stemCenter,
      stemTop,
      leftArmWidth: armWidth,
      rightArmWidth: armWidth,
      armTop,
      stemOpacity: clamp01((t - 0.01) / 0.1),
      leftArmOpacity: clamp01((t - 0.06) / 0.18),
      rightArmOpacity: clamp01((t - 0.5) / 0.12),
    };
  }, [progress]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        pointerEvents="none"
        style={[
          styles.leftArm,
          {
            width: geometry.leftArmWidth,
            left: geometry.stemCenter - geometry.leftArmWidth,
            top: geometry.armTop,
            opacity: geometry.leftArmOpacity,
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.rightArm,
          {
            width: geometry.rightArmWidth,
            left: geometry.stemCenter,
            top: geometry.armTop,
            opacity: geometry.rightArmOpacity,
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.stem,
          {
            width: geometry.stemWidth,
            height: geometry.stemHeight,
            left: geometry.stemLeft,
            top: geometry.stemTop,
            borderRadius: geometry.stemWidth / 2,
            opacity: geometry.stemOpacity,
          }
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: ICON_WIDTH,
    height: ICON_HEIGHT,
    transform: [{ translateX: ICON_TRANSLATE_X }, { translateY: 1 }],
  },
  leftArm: {
    position: 'absolute',
    height: ARM_HEIGHT,
    borderRadius: ARM_HEIGHT / 2,
    backgroundColor: DEBUG_COLOR,
  },
  rightArm: {
    position: 'absolute',
    height: ARM_HEIGHT,
    borderRadius: ARM_HEIGHT / 2,
    backgroundColor: DEBUG_COLOR,
  },
  stem: {
    position: 'absolute',
    backgroundColor: DEBUG_COLOR,
  },
});
