import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedProps, withSpring } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressBarProps {
  current: number;
  goal: number | null;
  color: string;
}

const ProgressBarComponent = React.memo(({ current, goal, color }: ProgressBarProps) => {
  const size = 50;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  const animatedOffset = useSharedValue(circumference);
  
  useEffect(() => {
    animatedOffset.value = circumference;
  }, []);
  
  const { targetOffset, diffText } = useMemo(() => {
    const percentage = goal ? Math.min((current / goal) * 100, 100) : 0;
    const targetOffset = circumference - (percentage / 100) * circumference;
    const diff = goal ? Math.round(current - goal) : null;
    const diffText = diff !== null ? (diff > 0 ? `+${diff}` : `${diff}`) : '';
    
    return { targetOffset, diffText };
  }, [current, goal, circumference]);
  
  useEffect(() => {
    animatedOffset.value = withSpring(targetOffset, {
      damping: 100,
      stiffness: 250,
    });
  }, [targetOffset]);
  
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedOffset.value,
  }));
  
  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1C1C1E"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {diffText !== '' && <Text style={styles.diffText}>{diffText}</Text>}
    </View>
  );
});

ProgressBarComponent.displayName = 'ProgressBar';

export function ProgressBar(props: ProgressBarProps) {
  return <ProgressBarComponent key={`${props.current}-${props.goal}`} {...props} />;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 8,
    height: 64,
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  diffText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    position: 'absolute',
    top: 26,
  },
});
