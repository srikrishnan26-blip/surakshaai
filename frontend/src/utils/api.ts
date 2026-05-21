const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const API_BASE = `${BACKEND_URL}/api`;

async function request(endpoint: string, options?: RequestInit) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // User
  createUser: (name: string) =>
    request('/user', { method: 'POST', body: JSON.stringify({ name }) }),

  getUser: (userId: string) => request(`/user/${userId}`),

  // Contacts
  addContact: (data: { user_id: string; name: string; phone: string; relation: string }) =>
    request('/contacts', { method: 'POST', body: JSON.stringify(data) }),

  getContacts: (userId: string) => request(`/contacts/${userId}`),

  deleteContact: (contactId: string) =>
    request(`/contacts/${contactId}`, { method: 'DELETE' }),

  // Route Risk
  analyzeRoute: (data: { destination: string; origin?: string; latitude?: number; longitude?: number }) =>
    request('/route-risk', { method: 'POST', body: JSON.stringify(data) }),

  // SOS
  triggerSOS: (data: { user_id: string; latitude: number; longitude: number; message?: string }) =>
    request('/sos', { method: 'POST', body: JSON.stringify(data) }),

  getSOSAlerts: (userId: string) => request(`/sos/${userId}`),

  // Tracking
  updateTracking: (data: { user_id: string; latitude: number; longitude: number; destination?: string }) =>
    request('/tracking', { method: 'POST', body: JSON.stringify(data) }),

  // Safe Locations
  getSafeLocations: (lat: number, lng: number) =>
    request(`/safe-locations?lat=${lat}&lng=${lng}`),

  seedSafeLocations: (lat: number, lng: number) =>
    request(`/safe-locations/seed?lat=${lat}&lng=${lng}`, { method: 'POST' }),

  // Voice SOS
  voiceSOS: async (audioUri: string, userId: string, latitude: number, longitude: number) => {
    const formData = new FormData();
    const filename = audioUri.split('/').pop() || 'audio.wav';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `audio/${match[1]}` : 'audio/wav';
    formData.append('audio', { uri: audioUri, name: filename, type } as any);
    formData.append('user_id', userId);
    formData.append('latitude', String(latitude));
    formData.append('longitude', String(longitude));

    const url = `${API_BASE}/voice-sos`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error ${res.status}: ${text}`);
    }
    return res.json();
  },
};
