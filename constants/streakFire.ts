type StreakFirePaletteName = 'green' | 'blue' | 'yellow' | 'white' | 'black';
const GREEN_PALETTE_LIGHTEN_AMOUNT = 0;
export const STREAK_FIRE_GRADIENT_PALETTES = {
  green: [
    [0, 0.2902, 0.9765, 0.451, 0.45, 0.62, 1, 0.7087, 0.899, 0.78, 1, 0.8313, 0.929, 0.2745, 0.9059, 0.4549, 1, 0.1, 1, 0.355],
    [0, 0.44, 1, 0.5707, 0.447, 0.6, 1, 0.6933, 0.89, 0.78, 1, 0.8313, 0.921, 0.2745, 0.9059, 0.4549, 1, 0.1, 1, 0.355],
    [0, 0.2146, 0.958, 0.202, 0.5, 0.1559, 0.978, 0.142, 1, 0.0953, 1, 0.08],
    [0.001, 0.2146, 0.958, 0.202, 0.792, 0.1559, 0.978, 0.142, 1, 0.0953, 1, 0.08],
    [0, 0.1902, 0.9832, 0.1768, 0.5, 0.1432, 0.9912, 0.1288, 1, 0.1, 1, 0.355],
    [0, 0.1517, 0.9824, 0.1376, 0.792, 0.1237, 0.991, 0.109, 1, 0.1, 1, 0.355],
    [0, 0.1793, 0.9742, 0.1658, 0.5, 0.1474, 0.9868, 0.1332, 1, 0.1, 1, 0.355],
    [0, 0.1984, 0.9748, 0.1852, 0.792, 0.1474, 0.9868, 0.1332, 1, 0.1, 1, 0.355],
    [0, 0.1, 1, 0.355, 0.792, 0.1, 1, 0.355, 1, 0.0953, 1, 0.08],
    [0.001, 0.1137, 0.4039, 0.1098, 0.5, 0.1517, 0.9824, 0.1376, 1, 0.1, 1, 0.355],
    [0.001, 0.2146, 0.958, 0.202, 0.712, 0.1559, 0.978, 0.142, 1, 0.0953, 1, 0.08],
    [0.001, 0.1137, 0.4039, 0.1098, 0.5, 0.1517, 0.9824, 0.1376, 1, 0.1, 1, 0.355],
    [0.001, 0.2146, 0.958, 0.202, 0.712, 0.1559, 0.978, 0.142, 1, 0.0953, 1, 0.08],
  ],
  blue: [
    [0, 0.46, 0.568, 1, 0.45, 0.62, 0.696, 1, 0.899, 0.5725, 0.6549, 0.9961, 0.929, 0.44, 0.552, 1, 1, 0.1, 0.28, 1],
    [0, 0.44, 0.552, 1, 0.447, 0.6, 0.68, 1, 0.89, 0.5725, 0.6549, 0.9961, 0.921, 0.44, 0.552, 1, 1, 0.1, 0.28, 1],
    [0, 0.202, 0.3532, 0.958, 0.5, 0.142, 0.3092, 0.978, 1, 0.08, 0.264, 1],
    [0.001, 0.202, 0.3532, 0.958, 0.792, 0.142, 0.3092, 0.978, 1, 0.08, 0.264, 1],
    [0, 0.1768, 0.3381, 0.9832, 0.5, 0.1288, 0.3013, 0.9912, 1, 0.1, 0.28, 1],
    [0, 0.1376, 0.3066, 0.9824, 0.792, 0.109, 0.2854, 0.991, 1, 0.1, 0.28, 1],
    [0, 0.1658, 0.3275, 0.9742, 0.5, 0.1332, 0.3039, 0.9868, 1, 0.1, 0.28, 1],
    [0, 0.1852, 0.3431, 0.9748, 0.792, 0.1332, 0.3039, 0.9868, 1, 0.1, 0.28, 1],
    [0, 0.1, 0.28, 1, 0.792, 0.1, 0.28, 1, 1, 0.08, 0.264, 1],
    [0.001, 0.1936, 0.3482, 0.9664, 0.5, 0.1376, 0.3066, 0.9824, 1, 0.1, 0.28, 1],
    [0.001, 0.202, 0.3532, 0.958, 0.712, 0.142, 0.3092, 0.978, 1, 0.08, 0.264, 1],
    [0.001, 0.1936, 0.3482, 0.9664, 0.5, 0.1376, 0.3066, 0.9824, 1, 0.1, 0.28, 1],
    [0.001, 0.202, 0.3532, 0.958, 0.712, 0.142, 0.3092, 0.978, 1, 0.08, 0.264, 1],
  ],
  yellow: [
    [0, 0.9961, 0.9608, 0.7412, 0.45, 1, 0.9493, 0.62, 0.899, 1, 0.9707, 0.78, 0.929, 1, 0.9253, 0.44, 1, 1, 0.91, 0.1],
    [0, 1, 0.9253, 0.44, 0.447, 1, 0.9467, 0.6, 0.89, 1, 0.9707, 0.78, 0.921, 1, 0.9253, 0.44, 1, 1, 0.91, 0.1],
    [0, 0.958, 0.8824, 0.202, 0.5, 0.978, 0.8944, 0.142, 1, 1, 0.908, 0.08],
    [0.001, 0.958, 0.8824, 0.202, 0.792, 0.978, 0.8944, 0.142, 1, 1, 0.908, 0.08],
    [0, 0.9832, 0.9026, 0.1768, 0.5, 0.9912, 0.905, 0.1288, 1, 1, 0.91, 0.1],
    [0, 0.9824, 0.8979, 0.1376, 0.792, 0.991, 0.9028, 0.109, 1, 1, 0.91, 0.1],
    [0, 0.9742, 0.8934, 0.1658, 0.5, 0.9868, 0.9014, 0.1332, 1, 1, 0.91, 0.1],
    [0, 0.9748, 0.8958, 0.1852, 0.792, 0.9868, 0.9014, 0.1332, 1, 1, 0.91, 0.1],
    [0, 0.8902, 0.7961, 0, 0.792, 1, 0.91, 0.1, 1, 1, 0.908, 0.08],
    [0.001, 0.9664, 0.8891, 0.1936, 0.5, 0.9824, 0.8979, 0.1376, 1, 1, 0.91, 0.1],
    [0.001, 0.958, 0.8824, 0.202, 0.712, 0.978, 0.8944, 0.142, 1, 1, 0.908, 0.08],
    [0.001, 0.9664, 0.8891, 0.1936, 0.5, 0.9824, 0.8979, 0.1376, 1, 1, 0.91, 0.1],
    [0.001, 0.958, 0.8824, 0.202, 0.712, 0.978, 0.8944, 0.142, 1, 1, 0.908, 0.08],
  ],
} as const;

function cloneAnimation<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function lightenGradient(gradient: readonly number[], amount: number): number[] {
  const next = [...gradient];
  for (let i = 1; i < next.length; i += 4) {
    next[i] = next[i] + (1 - next[i]) * amount;
    next[i + 1] = next[i + 1] + (1 - next[i + 1]) * amount;
    next[i + 2] = next[i + 2] + (1 - next[i + 2]) * amount;
  }
  return next;
}

function convertGradientToGray(gradient: readonly number[], minGray: number, maxGray: number): number[] {
  const next = [...gradient];
  for (let i = 1; i < next.length; i += 4) {
    const r = next[i];
    const g = next[i + 1];
    const b = next[i + 2];
    const luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
    const gray = minGray + ((maxGray - minGray) * luminance);
    next[i] = gray;
    next[i + 1] = gray;
    next[i + 2] = gray;
  }
  return next;
}

function convertGradientToWhite(gradient: readonly number[]): number[] {
  const next = [...gradient];
  for (let i = 1; i < next.length; i += 4) {
    next[i] = 1;
    next[i + 1] = 1;
    next[i + 2] = 1;
  }
  return next;
}

function darkenGradientToSmoke(gradient: readonly number[], lift = 0): number[] {
  const next = [...gradient];
  for (let i = 1; i < next.length; i += 4) {
    const r = next[i];
    const g = next[i + 1];
    const b = next[i + 2];
    const luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
    const smokeBase = 0.12 + (luminance * 0.5);
    const smoke = smokeBase + ((1 - smokeBase) * lift);
    next[i] = smoke;
    next[i + 1] = smoke;
    next[i + 2] = smoke;
  }
  return next;
}

function applyPaletteToGradients(node: unknown, palette: readonly (readonly number[])[], indexRef: { value: number }) {
  if (Array.isArray(node)) {
    node.forEach((item) => applyPaletteToGradients(item, palette, indexRef));
    return;
  }

  if (!node || typeof node !== 'object') return;

  const typedNode = node as Record<string, unknown>;
  if ((typedNode.ty === 'gf' || typedNode.ty === 'gs')
    && typedNode.g
    && typeof typedNode.g === 'object'
    && (typedNode.g as Record<string, unknown>).k
    && typeof (typedNode.g as Record<string, unknown>).k === 'object') {
    const gradient = palette[indexRef.value];
    if (gradient) {
      ((typedNode.g as Record<string, unknown>).k as Record<string, unknown>).k = [...gradient];
      indexRef.value += 1;
    }
  }

  Object.values(typedNode).forEach((value) => applyPaletteToGradients(value, palette, indexRef));
}

export function buildStreakFireAnimation<T extends object>(baseAnimation: T, paletteName: StreakFirePaletteName | null): T {
  if (!paletteName) return baseAnimation;

  const nextAnimation = cloneAnimation(baseAnimation);
  const palette = paletteName === 'green'
    ? STREAK_FIRE_GRADIENT_PALETTES.green.map((gradient) => lightenGradient(gradient, GREEN_PALETTE_LIGHTEN_AMOUNT))
    : paletteName === 'white'
      ? STREAK_FIRE_GRADIENT_PALETTES.yellow.map((gradient, index) => (
        index < 2
          ? convertGradientToGray(gradient, 0.46, 0.72)
          : convertGradientToWhite(gradient)
      ))
    : paletteName === 'black'
      ? STREAK_FIRE_GRADIENT_PALETTES.yellow.map((gradient, index) => darkenGradientToSmoke(gradient, index < 2 ? 0.28 : 0))
      : STREAK_FIRE_GRADIENT_PALETTES[paletteName];
  applyPaletteToGradients(nextAnimation, palette, { value: 0 });
  return nextAnimation;
}
