import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface Props {
  videoUrl: string;
  nodeId: string;
}

// Extract node number from "node-3" → "3"
function nodeLabel(nodeId: string): string {
  const match = nodeId.match(/\d+/);
  return match ? `第 ${match[0]} 幕` : nodeId;
}

export default function VideoMessage({ videoUrl, nodeId }: Props) {
  const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
  });

  const handlePlay = () => {
    setPlaying(true);
    player.play();
  };

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={playing}
      />
      {!playing && (
        <TouchableOpacity style={styles.overlay} onPress={handlePlay} activeOpacity={0.8}>
          <View style={styles.playBtn}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </TouchableOpacity>
      )}
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{nodeLabel(nodeId)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0d0d1a',
    marginVertical: 4,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(74,74,138,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 22,
    marginLeft: 4,
  },
  labelContainer: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  label: {
    color: '#ccc',
    fontSize: 12,
  },
});
