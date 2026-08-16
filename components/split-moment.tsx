import { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { splitImages, type SplitPose } from '@/components/onboarding';
import { Palette, useTheme } from '@/constants/sprintlab';

type SplitMomentProps = {
  title: string;
  message: string;
  pose?: SplitPose;
};

export function SplitMoment({ title, message, pose = 'listening' }: SplitMomentProps) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 13, stiffness: 150, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View
      accessibilityLabel={`Split says: ${title}. ${message}`}
      style={[styles.wrap, { opacity, transform: [{ scale }] }]}>
      <Image source={splitImages[pose]} style={styles.image} resizeMode="contain" />
      <View style={styles.copy}>
        <Text style={styles.kicker}>Split</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const createStyles = (palette: Palette) => StyleSheet.create({
  wrap: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  image: { width: 94, height: 94 },
  copy: { flex: 1, gap: 4 },
  kicker: { color: palette.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  message: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});
