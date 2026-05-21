import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/utils/api';

export default function WelcomeScreen() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGetStarted = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const user = await api.createUser(name.trim());
      await AsyncStorage.setItem('user_id', user.user_id);
      await AsyncStorage.setItem('user_name', user.name);
      router.replace('/(tabs)/home');
    } catch (e) {
      console.error('Error creating user:', e);
      // Still navigate even if backend fails
      await AsyncStorage.setItem('user_id', 'local-' + Date.now());
      await AsyncStorage.setItem('user_name', name.trim());
      router.replace('/(tabs)/home');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.topSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield-checkmark" size={64} color="#FF3B30" />
            </View>
            <Text testID="app-title" style={styles.title}>
              SurakshaAI
            </Text>
            <Text style={styles.subtitle}>Your Safety Companion</Text>
            <Text style={styles.description}>
              AI-powered safety for every journey. Real-time tracking, route analysis, and instant SOS alerts.
            </Text>
          </View>

          <View style={styles.bottomSection}>
            <Text style={styles.label}>YOUR NAME</Text>
            <TextInput
              testID="name-input"
              style={styles.input}
              placeholder="Enter your name"
              placeholderTextColor="#595D62"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleGetStarted}
            />

            <TouchableOpacity
              testID="get-started-btn"
              style={[styles.button, !name.trim() && styles.buttonDisabled]}
              onPress={handleGetStarted}
              disabled={!name.trim() || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Get Started</Text>
              )}
            </TouchableOpacity>

            <View style={styles.features}>
              <FeatureItem icon="location" text="Live GPS Tracking" />
              <FeatureItem icon="analytics" text="AI Route Analysis" />
              <FeatureItem icon="call" text="Instant SOS Alerts" />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={18} color="#FF3B30" />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9F6F0' },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 48,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#1A1C1E',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#FF3B30',
    marginTop: 4,
  },
  description: {
    fontSize: 16,
    color: '#595D62',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  bottomSection: {
    paddingBottom: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#595D62',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F0EBE1',
    borderRadius: 16,
    padding: 18,
    fontSize: 18,
    color: '#1A1C1E',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#FF3B30',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 32,
  },
  featureItem: {
    alignItems: 'center',
    gap: 6,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#595D62',
  },
});
