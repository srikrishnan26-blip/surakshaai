import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { api } from '../../src/utils/api';

export default function HomeScreen() {
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sosActive, setSosActive] = useState(false);
  const [contactCount, setContactCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const micPulse = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  useEffect(() => {
    loadUser();
    requestLocation();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      pulse.stop();
      stopListening();
    };
  }, []);

  const loadUser = async () => {
    const name = await AsyncStorage.getItem('user_name');
    const id = await AsyncStorage.getItem('user_id');
    if (name) setUserName(name);
    if (id) {
      setUserId(id);
      try {
        const contacts = await api.getContacts(id);
        setContactCount(contacts.length);
      } catch (e) {
        console.error('Failed to load contacts count');
      }
    }
  };

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Enable location services for safety features');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e) {
      console.log('Location error:', e);
    }
  };

  const handleSOS = async () => {
    if (!location) {
      Alert.alert('Location Unavailable', 'Please enable GPS to use SOS');
      return;
    }

    setSosActive(true);
    try {
      const result = await api.triggerSOS({
        user_id: userId,
        latitude: location.latitude,
        longitude: location.longitude,
        message: 'Emergency SOS Alert',
      });

      Alert.alert(
        'SOS Activated',
        `Emergency alert sent!\nLocation: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}\n${result.contacts_notified} contact(s) notified`,
        [{ text: 'OK', onPress: () => setSosActive(false) }]
      );
    } catch (e) {
      Alert.alert('SOS Alert', `Emergency location: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
      setSosActive(false);
    }
  };

  // ── Voice SOS ──

  const startListening = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed for voice SOS');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsListening(true);
      setVoiceStatus('Listening... Say "Help" or "SOS"');

      // Start mic pulse animation
      const micAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(micPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      micAnim.start();

      // Auto-stop after 6 seconds and process
      setTimeout(async () => {
        await processRecording(newRecording);
      }, 6000);
    } catch (e) {
      console.error('Recording error:', e);
      setVoiceStatus('Failed to start recording');
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (e) {
        // Already stopped
      }
      setRecording(null);
    }
    setIsListening(false);
    micPulse.setValue(1);
  };

  const processRecording = async (rec: Audio.Recording) => {
    try {
      setVoiceStatus('Processing voice...');
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      setRecording(null);
      setIsListening(false);
      micPulse.setValue(1);

      if (!uri) {
        setVoiceStatus('No audio recorded');
        return;
      }

      const lat = location?.latitude || 0;
      const lng = location?.longitude || 0;

      const result = await api.voiceSOS(uri, userId, lat, lng);

      if (result.triggered) {
        setVoiceStatus(`Trigger detected: "${result.matched_word}"`);
        Alert.alert(
          'Voice SOS Triggered!',
          `Detected: "${result.matched_word}"\nTranscription: "${result.transcription}"\n${result.contacts_notified || 0} contact(s) notified`,
          [{ text: 'OK', onPress: () => setVoiceStatus('') }]
        );
      } else {
        setVoiceStatus(
          result.transcription
            ? `Heard: "${result.transcription}" - No trigger word detected`
            : 'No speech detected. Try again.'
        );
        setTimeout(() => setVoiceStatus(''), 4000);
      }
    } catch (e) {
      console.error('Voice processing error:', e);
      setVoiceStatus('Error processing voice. Try again.');
      setIsListening(false);
      micPulse.setValue(1);
      setTimeout(() => setVoiceStatus(''), 3000);
    }
  };

  const handleVoicePress = async () => {
    if (isListening && recording) {
      await processRecording(recording);
    } else {
      await startListening();
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text testID="user-name" style={styles.userName}>{userName}</Text>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, location ? styles.statusActive : styles.statusInactive]} />
            <Text style={styles.statusText}>{location ? 'GPS Active' : 'No GPS'}</Text>
          </View>
        </View>

        {/* SOS Button */}
        <View style={styles.sosSection}>
          <Text style={styles.sosLabel}>EMERGENCY</Text>
          <Animated.View style={[styles.sosOuter, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity
              testID="sos-button"
              style={[styles.sosButton, sosActive && styles.sosButtonActive]}
              onPress={handleSOS}
              activeOpacity={0.7}
            >
              <Ionicons name="warning" size={40} color="#FFF" />
              <Text style={styles.sosText}>SOS</Text>
              <Text style={styles.sosSub}>Tap for help</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.sosHint}>
            {contactCount > 0
              ? `${contactCount} emergency contact(s) will be notified`
              : 'Add emergency contacts to notify them'}
          </Text>
        </View>

        {/* Voice SOS Section */}
        <View style={styles.voiceCard}>
          <View style={styles.voiceHeader}>
            <Ionicons name="mic" size={20} color="#5856D6" />
            <Text style={styles.voiceTitle}>Voice-Activated SOS</Text>
          </View>
          <Text style={styles.voiceDesc}>
            Tap the mic and say "Help", "SOS", or "Bachao" to trigger an alert
          </Text>

          <View style={styles.voiceRow}>
            <Animated.View style={{ transform: [{ scale: micPulse }] }}>
              <TouchableOpacity
                testID="voice-sos-btn"
                style={[
                  styles.micButton,
                  isListening && styles.micButtonActive,
                ]}
                onPress={handleVoicePress}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isListening ? 'radio' : 'mic'}
                  size={28}
                  color="#FFF"
                />
              </TouchableOpacity>
            </Animated.View>

            {voiceStatus ? (
              <View style={styles.voiceStatusContainer}>
                {isListening && (
                  <View style={styles.listeningDots}>
                    <View style={[styles.audioDot, styles.audioDot1]} />
                    <View style={[styles.audioDot, styles.audioDot2]} />
                    <View style={[styles.audioDot, styles.audioDot3]} />
                  </View>
                )}
                <Text testID="voice-status" style={styles.voiceStatusText}>{voiceStatus}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.triggerWords}>
            <Text style={styles.triggerLabel}>TRIGGER WORDS</Text>
            <View style={styles.triggerChips}>
              {['Help', 'SOS', 'Bachao', 'Emergency', 'Police', 'Save me'].map((w) => (
                <View key={w} style={styles.chip}>
                  <Text style={styles.chipText}>{w}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            testID="route-check-btn"
            style={styles.actionCard}
            onPress={() => router.push('/route-check')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(88, 86, 214, 0.1)' }]}>
              <Ionicons name="analytics" size={28} color="#5856D6" />
            </View>
            <Text style={styles.actionTitle}>Route Safety</Text>
            <Text style={styles.actionDesc}>AI-powered analysis</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="live-tracking-btn"
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/map')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
              <Ionicons name="navigate" size={28} color="#007AFF" />
            </View>
            <Text style={styles.actionTitle}>Live Tracking</Text>
            <Text style={styles.actionDesc}>Share your location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="safe-places-btn"
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/map')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(52, 199, 89, 0.1)' }]}>
              <Ionicons name="medkit" size={28} color="#34C759" />
            </View>
            <Text style={styles.actionTitle}>Safe Places</Text>
            <Text style={styles.actionDesc}>Nearby shelters</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="emergency-contacts-btn"
            style={styles.actionCard}
            onPress={() => router.navigate('/(tabs)/contacts')}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}>
              <Ionicons name="people" size={28} color="#FF3B30" />
            </View>
            <Text style={styles.actionTitle}>Contacts</Text>
            <Text style={styles.actionDesc}>{contactCount} saved</Text>
          </TouchableOpacity>
        </View>

        {/* Emergency Numbers */}
        <View style={styles.emergencyCard}>
          <Text style={styles.emergencyTitle}>Emergency Helplines</Text>
          <View style={styles.helplineRow}>
            <HelplineItem number="112" label="Emergency" />
            <HelplineItem number="100" label="Police" />
            <HelplineItem number="1091" label="Women" />
            <HelplineItem number="108" label="Ambulance" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HelplineItem({ number, label }: { number: string; label: string }) {
  return (
    <View style={styles.helplineItem}>
      <Text style={styles.helplineNumber}>{number}</Text>
      <Text style={styles.helplineLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9F6F0' },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  greeting: { fontSize: 14, fontWeight: '500', color: '#595D62' },
  userName: { fontSize: 28, fontWeight: '800', color: '#1A1C1E', letterSpacing: -0.5 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    elevation: 2,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusActive: { backgroundColor: '#34C759' },
  statusInactive: { backgroundColor: '#FF3B30' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#595D62' },
  sosSection: { alignItems: 'center', marginBottom: 24 },
  sosLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: '#FF3B30', marginBottom: 16 },
  sosOuter: { borderRadius: 90, padding: 12, backgroundColor: 'rgba(255, 59, 48, 0.08)' },
  sosButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
  },
  sosButtonActive: { backgroundColor: '#CC2F26' },
  sosText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', marginTop: 4 },
  sosSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500' },
  sosHint: { fontSize: 13, color: '#595D62', marginTop: 12, textAlign: 'center' },

  // Voice SOS
  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(88, 86, 214, 0.15)',
    elevation: 2,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  voiceTitle: { fontSize: 18, fontWeight: '700', color: '#1A1C1E' },
  voiceDesc: { fontSize: 13, color: '#595D62', lineHeight: 20, marginBottom: 16 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  micButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5856D6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  micButtonActive: {
    backgroundColor: '#FF3B30',
  },
  voiceStatusContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listeningDots: {
    flexDirection: 'row',
    gap: 3,
  },
  audioDot: {
    width: 4,
    height: 16,
    borderRadius: 2,
    backgroundColor: '#FF3B30',
  },
  audioDot1: { height: 12 },
  audioDot2: { height: 20 },
  audioDot3: { height: 8 },
  voiceStatusText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1C1E',
    fontWeight: '500',
  },
  triggerWords: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0EBE1',
  },
  triggerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#595D62',
    marginBottom: 8,
  },
  triggerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: 'rgba(88, 86, 214, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#5856D6' },

  // Quick Actions
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    width: '48%',
    flexGrow: 1,
    flexBasis: '45%',
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1C1E' },
  actionDesc: { fontSize: 12, color: '#595D62', marginTop: 2 },

  // Emergency
  emergencyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    elevation: 2,
  },
  emergencyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1C1E', marginBottom: 16 },
  helplineRow: { flexDirection: 'row', justifyContent: 'space-between' },
  helplineItem: { alignItems: 'center', minWidth: 60 },
  helplineNumber: { fontSize: 20, fontWeight: '800', color: '#FF3B30' },
  helplineLabel: { fontSize: 11, color: '#595D62', marginTop: 4, fontWeight: '500' },
});
