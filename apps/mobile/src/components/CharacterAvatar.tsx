import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  size?: number;
}

export default function CharacterAvatar({ size = 40 }: Props) {
  const fontSize = size * 0.42;
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.text, { fontSize }]}>影</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: '#4a4a8a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#6a6aaa',
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
