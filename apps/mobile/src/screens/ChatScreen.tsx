import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { createSession, sendMessage, connectWebSocket, VideoReadyEvent } from '../api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export default function ChatScreen() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoEvents, setVideoEvents] = useState<VideoReadyEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    createSession().then((sess) => {
      setSessionId(sess.session_id);
      wsRef.current = connectWebSocket(sess.session_id, (event) => {
        setVideoEvents((prev) => [...prev, event]);
      });
    });
    return () => wsRef.current?.close();
  }, []);

  const send = useCallback(async () => {
    if (!input.trim() || !sessionId || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', text },
    ]);
    setLoading(true);
    try {
      const res = await sendMessage(sessionId, text);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', text: res.text },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, sessionId, loading]);

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
      <Text style={styles.bubbleText}>{item.text}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {videoEvents.length > 0 && (
        <View style={styles.videoBanner}>
          <Text style={styles.videoBannerText}>
            🎬 视频已就绪: {videoEvents[videoEvents.length - 1].node_id}
          </Text>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      {loading && <ActivityIndicator style={styles.loader} color="#888" />}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="说点什么..."
          placeholderTextColor="#555"
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading}>
          <Text style={styles.sendBtnText}>发送</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { maxWidth: '80%', borderRadius: 12, padding: 12, marginBottom: 8 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#1a1a2e' },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: '#16213e' },
  bubbleText: { color: '#e0e0e0', fontSize: 15, lineHeight: 22 },
  loader: { marginVertical: 8 },
  inputRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
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
    marginLeft: 8,
    backgroundColor: '#4a4a8a',
    borderRadius: 20,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600' },
  videoBanner: {
    backgroundColor: '#1a2a1a',
    padding: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3a2a',
  },
  videoBannerText: { color: '#4caf50', fontSize: 13 },
});
