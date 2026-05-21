import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../../src/utils/api';

type SafePlace = {
  location_id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  address: string;
  phone: string;
};

export default function MapScreen() {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [safePlaces, setSafePlaces] = useState<SafePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    init();
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
      }
    };
  }, []);

  const init = async () => {
    const id = await AsyncStorage.getItem('user_id');
    if (id) setUserId(id);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location is needed for safety features');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setLocation(coords);

      // Load safe locations
      try {
        await api.seedSafeLocations(coords.latitude, coords.longitude);
        const places = await api.getSafeLocations(coords.latitude, coords.longitude);
        setSafePlaces(places);
      } catch (e) {
        console.error('Failed to load safe locations:', e);
      }
    } catch (e) {
      console.error('Location error:', e);
    }
    setLoading(false);
  };

  const startTracking = async () => {
    setTracking(true);
    try {
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 5,
        },
        (loc) => {
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setLocation(coords);
          // Send tracking update to backend
          if (userId) {
            api.updateTracking({
              user_id: userId,
              latitude: coords.latitude,
              longitude: coords.longitude,
            }).catch(console.error);
          }
        }
      );
    } catch (e) {
      console.error('Tracking error:', e);
      setTracking(false);
    }
  };

  const stopTracking = () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setTracking(false);
  };

  const getTypeIcon = (type: string): string => {
    switch (type) {
      case 'police': return 'shield';
      case 'hospital': return 'medkit';
      case 'shelter': return 'home';
      case 'fire': return 'flame';
      default: return 'location';
    }
  };

  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'police': return '#007AFF';
      case 'hospital': return '#34C759';
      case 'shelter': return '#FF9500';
      case 'fire': return '#FF3B30';
      default: return '#5856D6';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF3B30" />
          <Text style={styles.loadingText}>Loading map data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Safety Map</Text>
          <View style={[styles.trackingBadge, tracking && styles.trackingActive]}>
            <View style={[styles.trackingDot, tracking && styles.trackingDotActive]} />
            <Text style={[styles.trackingText, tracking && styles.trackingTextActive]}>
              {tracking ? 'LIVE' : 'OFF'}
            </Text>
          </View>
        </View>

        {/* Map Placeholder */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <Ionicons name="map" size={48} color="#007AFF" />
            {location ? (
              <>
                <Text style={styles.mapCoords}>
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </Text>
                <Text style={styles.mapNote}>GPS Location Active</Text>
                {tracking && (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveRedDot} />
                    <Text style={styles.liveText}>LIVE TRACKING</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.mapNote}>Location not available</Text>
            )}
          </View>

          {/* Map markers overlay */}
          {safePlaces.length > 0 && (
            <View style={styles.markersOverlay}>
              {safePlaces.slice(0, 4).map((place, i) => (
                <View
                  key={place.location_id}
                  style={[
                    styles.markerPin,
                    { left: 30 + (i * 70), top: 20 + ((i % 2) * 40) },
                  ]}
                >
                  <View style={[styles.markerIcon, { backgroundColor: getTypeColor(place.type) }]}>
                    <Ionicons name={getTypeIcon(place.type) as any} size={14} color="#FFF" />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Tracking Controls */}
        <View style={styles.controlsRow}>
          {!tracking ? (
            <TouchableOpacity
              testID="start-tracking-btn"
              style={styles.startBtn}
              onPress={startTracking}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={20} color="#FFF" />
              <Text style={styles.startBtnText}>Start Live Tracking</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="stop-tracking-btn"
              style={styles.stopBtn}
              onPress={stopTracking}
              activeOpacity={0.8}
            >
              <Ionicons name="stop-circle" size={20} color="#FFF" />
              <Text style={styles.stopBtnText}>Stop Tracking</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Safe Places List */}
        <View style={styles.placesHeader}>
          <Text style={styles.placesTitle}>Nearby Safe Places</Text>
          <Text style={styles.placesCount}>{safePlaces.length} found</Text>
        </View>

        <ScrollView style={styles.placesList} showsVerticalScrollIndicator={false}>
          {safePlaces.map((place) => (
            <View key={place.location_id} testID={`safe-place-${place.location_id}`} style={styles.placeCard}>
              <View style={[styles.placeIcon, { backgroundColor: `${getTypeColor(place.type)}15` }]}>
                <Ionicons name={getTypeIcon(place.type) as any} size={22} color={getTypeColor(place.type)} />
              </View>
              <View style={styles.placeInfo}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeAddress}>{place.address}</Text>
                {place.phone ? (
                  <View style={styles.phoneRow}>
                    <Ionicons name="call-outline" size={12} color="#595D62" />
                    <Text style={styles.placePhone}>{place.phone}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.placeTypeBadge, { backgroundColor: `${getTypeColor(place.type)}15` }]}>
                <Text style={[styles.placeTypeText, { color: getTypeColor(place.type) }]}>
                  {place.type.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
          {safePlaces.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={48} color="#E5E0D8" />
              <Text style={styles.emptyText}>No safe places found nearby</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9F6F0' },
  container: { flex: 1, padding: 24 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 16, color: '#595D62' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1C1E',
    letterSpacing: -0.5,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0EBE1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  trackingActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#595D62',
  },
  trackingDotActive: {
    backgroundColor: '#FF3B30',
  },
  trackingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#595D62',
    letterSpacing: 0.5,
  },
  trackingTextActive: {
    color: '#FF3B30',
  },
  mapContainer: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#007AFF20',
  },
  mapCoords: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 8,
  },
  mapNote: {
    fontSize: 12,
    color: '#595D62',
    marginTop: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    gap: 6,
  },
  liveRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF3B30',
    letterSpacing: 0.5,
  },
  markersOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  markerPin: {
    position: 'absolute',
  },
  markerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  controlsRow: {
    marginBottom: 20,
  },
  startBtn: {
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
  startBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stopBtn: {
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    borderRadius: 9999,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  stopBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  placesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  placesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1C1E',
  },
  placesCount: {
    fontSize: 13,
    color: '#595D62',
    fontWeight: '500',
  },
  placesList: {
    flex: 1,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  placeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1C1E',
  },
  placeAddress: {
    fontSize: 12,
    color: '#595D62',
    marginTop: 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  placePhone: {
    fontSize: 12,
    color: '#595D62',
  },
  placeTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  placeTypeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#595D62',
  },
});
