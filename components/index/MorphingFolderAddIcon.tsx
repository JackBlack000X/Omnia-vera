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
    const leftArmPhase = smoothStep(clamp01((t - 0.1) / 0.36));
    const rightArmPhase = smoothStep(clamp01((t - 0.54) / 0.2));
    const leftStretchEnter = smoothStep(clamp01((t - 0.03) / 0.2));
    const leftStretchExit = smoothStep(clamp01((t - 0.34) / 0.14));
    const rightStretchEnter = smoothStep(clamp01((t - 0.58) / 0.1));
    const rightStretchExit = smoothStep(clamp01((t - 0.78) / 0.1));
    const leftStretchPhase = leftStretchEnter * (1 - leftStretchExit);
    const rightStretchPhase = rightStretchEnter * (1 - rightStretchExit);

    const stemCoreWidth = STEM_WIDTH_MIN + (STEM_WIDTH_MAX - STEM_WIDTH_MIN) * stemPhase;
    const stemWidth = stemCoreWidth + ARM_HEIGHT * 0.42 * Math.max(leftStretchPhase, rightStretchPhase);
    const stemHeight = STEM_HEIGHT_MIN + (STEM_HEIGHT_MAX - STEM_HEIGHT_MIN) * stemPhase;
    const stemLeft = BUTTON_WIDTH - STEM_RIGHT_PADDING - stemWidth;
    const stemTop = (ICON_HEIGHT - stemHeight) / 2;
    const stemCenter = stemLeft + stemWidth / 2;
    const armCoreWidth = ARM_HEIGHT * 0.9;
    const leftArmWidth = armCoreWidth + Math.max(0, (ARM_LENGTH_MAX - armCoreWidth) * leftArmPhase);
    const rightArmWidth = armCoreWidth + Math.max(0, (ARM_LENGTH_MAX - armCoreWidth) * rightArmPhase);
    const armTop = (ICON_HEIGHT - ARM_HEIGHT) / 2;
    const armOverlap = ARM_HEIGHT * 0.62;

    const leftBlobWidth = ARM_HEIGHT + ARM_LENGTH_MAX * 1.1 * leftStretchPhase;
    const leftBlobHeight = ARM_HEIGHT + stemHeight * 0.85 * leftStretchPhase;
    const leftBlobTop = (ICON_HEIGHT - leftBlobHeight) / 2;
    const leftBlobLeft = stemCenter - leftBlobWidth + ARM_HEIGHT * 0.78;

    const rightBlobWidth = ARM_HEIGHT * 0.75 + ARM_LENGTH_MAX * 0.5 * rightStretchPhase;
    const rightBlobHeight = ARM_HEIGHT + stemHeight * 0.42 * rightStretchPhase;
    const rightBlobTop = (ICON_HEIGHT - rightBlobHeight) / 2;
    const rightBlobLeft = stemCenter - ARM_HEIGHT * 0.3;

    return {
      stemWidth,
      stemHeight,
      stemLeft,
      stemCenter,
      stemTop,
      leftArmWidth,
      rightArmWidth,
      armTop,
      armOverlap,
      leftBlobWidth,
      leftBlobHeight,
      leftBlobTop,
      leftBlobLeft,
      rightBlobWidth,
      rightBlobHeight,
      rightBlobTop,
      rightBlobLeft,
      stemOpacity: clamp01((t - 0.01) / 0.1),
      leftArmOpacity: clamp01((t - 0.06) / 0.18),
      rightArmOpacity: clamp01((t - 0.6) / 0.08),
      leftBlobOpacity: clamp01((t - 0.04) / 0.14) * (1 - clamp01((t - 0.48) / 0.12)),
      rightBlobOpacity: clamp01((t - 0.6) / 0.06) * (1 - clamp01((t - 0.9) / 0.08)),
    };
  }, [progress]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        pointerEvents="none"
        style={[
          styles.stretchBlob,
          {
            width: geometry.leftBlobWidth,
            height: geometry.leftBlobHeight,
            left: geometry.leftBlobLeft,
            top: geometry.leftBlobTop,
            borderRadius: geometry.leftBlobHeight / 2,
            opacity: geometry.leftBlobOpacity,
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.stretchBlob,
          {
            width: geometry.rightBlobWidth,
            height: geometry.rightBlobHeight,
            left: geometry.rightBlobLeft,
            top: geometry.rightBlobTop,
            borderRadius: geometry.rightBlobHeight / 2,
            opacity: geometry.rightBlobOpacity,
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.leftArm,
          {
            width: geometry.leftArmWidth,
            left: geometry.stemCenter - geometry.leftArmWidth + geometry.armOverlap,
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
            left: geometry.stemCenter - geometry.armOverlap,
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
  stretchBlob: {
    position: 'absolute',
    backgroundColor: DEBUG_COLOR,
  },
  stem: {
    position: 'absolute',
    backgroundColor: DEBUG_COLOR,
  },
});
