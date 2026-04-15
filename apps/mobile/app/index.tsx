import React, { useState } from 'react';
import HomeScreen from '../src/screens/HomeScreen';
import ChatScreen from '../src/screens/ChatScreen';

export default function Index() {
  const [started, setStarted] = useState(false);
  return started ? <ChatScreen /> : <HomeScreen onStart={() => setStarted(true)} />;
}
