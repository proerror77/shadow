import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { sendMessage, connectWebSocket, endSession, VideoReadyEvent } from '../api';
import CharacterAvatar from '../components/CharacterAvatar';
import VideoMessage from '../components/VideoMessage';

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'video';
  text: string;
  videoUrl?: string;
  nodeId?: string;
}

export default function ChatScreen() {
  const userId = useRef(makeId()).current;
  const sessionId = useRef(makeId()).current;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    wsRef.current = connectWebSocket(sessionId, (event: VideoReadyEvent) => {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'video',
          text: '',
          videoUrl: event.video_url,
          nodeId: event.node_id,
        },
      ]);
    });
    return () => {
      wsRef.current?.close();
      endSession(userId);
    };
  }, []);

  const send = useCallback(async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { id: makeId(), role: 'user', text }]);
    setLoading(true);
    try {
      const res = await sendMessage(userId, sessionId, text);
      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', text: res.text }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const renderItem = ({ item }: { item: Message }) => {
    if (item.role === 'video') {
      return (
        <View style={styles.videoWrapper}>
          <VideoMessage videoUrl={item.videoUrl!} nodeId={item.nodeId!} />
        </View>
      );
    }
    if (item.role === 'assistant') {
      return (
        <View style={styles.aiRow}>
          <CharacterAvatar size={32} />
          <View style={[styles.bubble, styles.aiBubble]}>
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.userRow}>
        <View style={[styles.bubble, styles.userBubble]}>
          <Text style={styles.bubbleText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <CharacterAvatar size={40} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>影</Text>
          <View style={styles.onlineRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>在线</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />
        {loading && (
          <View style={styles.typingRow}>
            <CharacterAvatar size={24} />
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color="#888" />
            </View>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="说点什么..."
            placeholderTextColor="#444"
            onSubmitEditing={send}
            returnKeyType="send"
            multiline={false}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading}>
            <Text style={styles.sendBtnText}>发送</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  headerInfo: { flex: 1 },
  headerName: { color: '#e0e0e0', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4caf50' },
  onlineText: { color: '#4caf50', fontSize: 11 },

  // Messages
  messageList: { padding: 16, paddingBottom: 8, gap: 8 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  userRow: { alignItems: 'flex-end' },
  videoWrapper: { width: '90%', alignSelf: 'center' },

  bubble: { borderRadius: 16, padding: 12, maxWidth: '100%' },
  aiBubble: { backgroundColor: '#16213e', borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: '#1a1a2e', borderBottomRightRadius: 4 },
  bubbleText: { color: '#e0e0e0', fontSize: 15, lineHeight: 22 },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  typingBubble: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#4a4a8a',
    borderRadius: 20,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600' },
});
