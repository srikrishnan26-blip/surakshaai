import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api } from '../src/utils/api';

type RiskResult = {
  risk: string;
  score: number;
  summary: string;
  tips: string[];
  safe_alternatives: string[];
};

export default function RouteCheckScreen() {
  const [destination, setDestination] = useState('');
  const [origin, setOrigin] = useState('Current Location');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<RiskResult | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const router = useRouter();

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
    } catch (e) {
      console.log('Location error:', e);
    }
  };

  const handleAnalyze = async () => {
    if (!destination.trim()) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const data = await api.analyzeRoute({
        destination: destination.trim(),
        origin,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      setResult(data);
    } catch (e) {
      setResult({
        risk: 'Moderate',
        score: 50,
        summary: 'Could not complete analysis. Stay alert and follow general safety guidelines.',
        tips: ['Share your location with someone', 'Stay in well-lit areas', 'Keep your phone charged'],
        safe_alternatives: [],
      });
    }
    setAnalyzing(false);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low': return '#34C759';
      case 'Moderate': return '#FF9500';
      case 'High': return '#FF3B30';
      default: return '#595D62';
    }
  };

  const getRiskIcon = (risk: string): string => {
    switch (risk) {
      case 'Low': return 'shield-checkmark';
      case 'Moderate': return 'alert-circle';
      case 'High': return 'warning';
      default: return 'help-circle';
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              testID="back-btn"
              style={styles.backBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#1A1C1E" />
            </TouchableOpacity>
            <Text style={styles.title}>Route Safety</Text>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={14} color="#5856D6" />
              <Text style={styles.aiText}>AI</Text>
            </View>
          </View>

          <Text style={styles.description}>
            Get AI-powered safety analysis of your travel route
          </Text>

          {/* Input Section */}
          <View style={styles.inputSection}>
            <View style={styles.inputRow}>
              <View style={[styles.dot, { backgroundColor: '#34C759' }]} />
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>FROM</Text>
                <TextInput
                  testID="origin-input"
                  style={styles.input}
                  placeholder="Your location"
                  placeholderTextColor="#595D62"
                  value={origin}
                  onChangeText={setOrigin}
                />
              </View>
            </View>

            <View style={styles.connectLine} />

            <View style={styles.inputRow}>
              <View style={[styles.dot, { backgroundColor: '#FF3B30' }]} />
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>TO</Text>
                <TextInput
                  testID="destination-input"
                  style={styles.input}
                  placeholder="Enter destination"
                  placeholderTextColor="#595D62"
                  value={destination}
                  onChangeText={setDestination}
                  returnKeyType="done"
                  onSubmitEditing={handleAnalyze}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            testID="analyze-route-btn"
            style={[styles.analyzeBtn, !destination.trim() && styles.analyzeBtnDisabled]}
            onPress={handleAnalyze}
            disabled={!destination.trim() || analyzing}
            activeOpacity={0.8}
          >
            {analyzing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="analytics" size={20} color="#FFF" />
                <Text style={styles.analyzeBtnText}>Analyze Safety</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Loading State */}
          {analyzing && (
            <View style={styles.analyzingCard}>
              <ActivityIndicator size="small" color="#5856D6" />
              <Text style={styles.analyzingText}>AI is analyzing your route...</Text>
              <Text style={styles.analyzingHint}>Checking safety factors, nearby services, and more</Text>
            </View>
          )}

          {/* Result */}
          {result && !analyzing && (
            <View style={styles.resultSection}>
              {/* Risk Score */}
              <View style={[styles.riskCard, { borderLeftColor: getRiskColor(result.risk), borderLeftWidth: 4 }]}>
                <View style={styles.riskHeader}>
                  <View style={[styles.riskIconContainer, { backgroundColor: `${getRiskColor(result.risk)}15` }]}>
                    <Ionicons name={getRiskIcon(result.risk) as any} size={32} color={getRiskColor(result.risk)} />
                  </View>
                  <View style={styles.riskInfo}>
                    <Text style={styles.riskLabel}>RISK LEVEL</Text>
                    <Text style={[styles.riskLevel, { color: getRiskColor(result.risk) }]}>{result.risk}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: `${getRiskColor(result.risk)}15` }]}>
                    <Text style={[styles.scoreText, { color: getRiskColor(result.risk) }]}>{result.score}/100</Text>
                  </View>
                </View>
                <Text style={styles.riskSummary}>{result.summary}</Text>
              </View>

              {/* Safety Tips */}
              {result.tips.length > 0 && (
                <View style={styles.tipsCard}>
                  <Text style={styles.sectionTitle}>Safety Tips</Text>
                  {result.tips.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <View style={styles.tipNumber}>
                        <Text style={styles.tipNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Safe Alternatives */}
              {result.safe_alternatives.length > 0 && (
                <View style={styles.altCard}>
                  <Text style={styles.sectionTitle}>Safer Alternatives</Text>
                  {result.safe_alternatives.map((alt, i) => (
                    <View key={i} style={styles.altRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                      <Text style={styles.altText}>{alt}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  testID="start-tracking-from-result"
                  style={styles.trackBtn}
                  onPress={() => router.replace('/(tabs)/map')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate" size={18} color="#FFF" />
                  <Text style={styles.trackBtnText}>Start Tracking</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9F6F0' },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0EBE1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1C1E',
    flex: 1,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(88, 86, 214, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  aiText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5856D6',
  },
  description: {
    fontSize: 14,
    color: '#595D62',
    marginBottom: 24,
    marginLeft: 56,
  },
  inputSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1A1C1E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  inputWrapper: { flex: 1 },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#595D62',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F0EBE1',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1A1C1E',
  },
  connectLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E5E0D8',
    marginLeft: 5,
    marginVertical: 4,
  },
  analyzeBtn: {
    flexDirection: 'row',
    backgroundColor: '#5856D6',
    borderRadius: 9999,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    shadowColor: '#5856D6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  analyzeBtnDisabled: { opacity: 0.5 },
  analyzeBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  analyzingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  analyzingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5856D6',
  },
  analyzingHint: {
    fontSize: 13,
    color: '#595D62',
  },
  resultSection: { gap: 12 },
  riskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#1A1C1E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  riskIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskInfo: { flex: 1 },
  riskLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#595D62',
  },
  riskLevel: {
    fontSize: 28,
    fontWeight: '800',
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '800',
  },
  riskSummary: {
    fontSize: 15,
    color: '#595D62',
    lineHeight: 22,
  },
  tipsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1C1E',
    marginBottom: 14,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  tipNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0EBE1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#595D62',
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1C1E',
    lineHeight: 20,
  },
  altCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  altText: {
    flex: 1,
    fontSize: 14,
    color: '#1A1C1E',
    lineHeight: 20,
  },
  actionRow: {
    marginTop: 8,
  },
  trackBtn: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    borderRadius: 9999,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  trackBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
