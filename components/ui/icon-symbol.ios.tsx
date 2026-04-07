import { SymbolType, SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export function IconSymbol({
  name,
  size = 24,
  color,
  type = 'monochrome',
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: string;
  type?: SymbolType;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      type={type}
      weight={weight}
      tintColor={type === 'multicolor' ? undefined : color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
