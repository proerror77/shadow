import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  onStart: () => void;
}

export default function HomeScreen({ onStart }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>影境</Text>
      <Text style={styles.subtitle}>你的故事，你来导演</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="开始故事，进入互动叙事体验"
      >
        <Text style={styles.btnText}>开始故事</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' },
  title: { fontSize: 48, fontWeight: 'bold', color: '#fff', letterSpacing: 4 },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8, marginBottom: 48 },
  btn: {
    backgroundColor: '#4a4a8a',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
