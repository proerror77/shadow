import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CharacterAvatar from '../components/CharacterAvatar';

interface Props {
  onStart: () => void;
}

export default function HomeScreen({ onStart }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>影境</Text>
        <Text style={styles.subtitle}>你的故事，你来导演</Text>
      </View>

      <View style={styles.middle}>
        <CharacterAvatar size={120} />
        <Text style={styles.characterName}>影</Text>
        <Text style={styles.characterDesc}>你的专属叙事 AI</Text>
      </View>

      <TouchableOpacity
        style={styles.btn}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="开始故事"
      >
        <Text style={styles.btnText}>开始故事</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  top: { alignItems: 'center' },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 8,
    letterSpacing: 2,
  },
  middle: { alignItems: 'center', gap: 12 },
  characterName: {
    fontSize: 22,
    color: '#c0b8e8',
    fontWeight: '600',
    letterSpacing: 3,
    marginTop: 4,
  },
  characterDesc: {
    fontSize: 13,
    color: '#555',
    letterSpacing: 1,
  },
  btn: {
    backgroundColor: '#4a4a8a',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: 2 },
});
