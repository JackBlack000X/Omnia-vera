import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const BASE_SIZE = 18;
const ART_SIZE = 20;

const RAY_TRIANGLES = [
  { left: 8.2, top: -2.9, rotate: '0deg' },
  { left: 15.8, top: 0.2, rotate: '45deg' },
  { left: 18.9, top: 8.0, rotate: '90deg' },
  { left: 15.8, top: 15.1, rotate: '135deg' },
  { left: 8.2, top: 18.2, rotate: '180deg' },
  { left: 0.6, top: 15.1, rotate: '225deg' },
  { left: -2.5, top: 8.0, rotate: '270deg' },
  { left: 0.6, top: 0.2, rotate: '315deg' },
] as const;

type Props = {
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    width: ART_SIZE,
    height: ART_SIZE,
  },
  piece: {
    position: 'absolute',
  },
  ray: {
    width: 0,
    height: 0,
    borderLeftWidth: 2.8,
    borderRightWidth: 2.8,
    borderBottomWidth: 5.2,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f08c18',
    opacity: 0.95,
  },
  orb: {
    width: 12.8,
    height: 12.8,
    left: 4.2,
    top: 3.6,
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
});

export const VacationUmbrellaIcon = React.memo(function VacationUmbrellaIcon({
  color,
  size = BASE_SIZE,
  style,
}: Props) {
  const scale = (size / ART_SIZE) * 0.9;
  const resolvedColor = color ?? '#f97316';
  const resolvedRayColor = color ?? '#f08c18';

  return (
    <View style={[styles.root, { width: size, height: size }, style]}>
      <View style={[styles.art, { transform: [{ scale }] }]}>
        {RAY_TRIANGLES.map((ray) => (
          <View
            key={`${ray.left}-${ray.top}-${ray.rotate}`}
            style={[
              styles.piece,
              styles.ray,
              {
                left: ray.left,
                top: ray.top,
                borderBottomColor: resolvedRayColor,
                transform: [{ rotate: ray.rotate }],
              },
            ]}
          />
        ))}
        <View style={[styles.piece, styles.orb, { backgroundColor: resolvedColor }]} />
      </View>
    </View>
  );
});
