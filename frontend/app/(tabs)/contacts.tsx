import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../src/utils/api';

type Contact = {
  contact_id: string;
  user_id: string;
  name: string;
  phone: string;
  relation: string;
  created_at: string;
};

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const LOCAL_CONTACTS_KEY = 'local_contacts';

  const getLocalContacts = async (): Promise<Contact[]> => {
    try {
      const raw = await AsyncStorage.getItem(LOCAL_CONTACTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalContacts = async (list: Contact[]) => {
    try {
      await AsyncStorage.setItem(LOCAL_CONTACTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to persist local contacts:', e);
    }
  };

  const mergeContacts = (remote: Contact[], local: Contact[]): Contact[] => {
    const map = new Map<string, Contact>();
    [...remote, ...local].forEach((c) => map.set(c.contact_id, c));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  const init = async () => {
    let id = await AsyncStorage.getItem('user_id');
    if (!id) {
      // Ensure a user_id always exists, even if user reached contacts before onboarding
      id = 'local-' + Date.now();
      await AsyncStorage.setItem('user_id', id);
    }
    setUserId(id);
    await loadContacts(id);
    setLoading(false);
  };

  const loadContacts = async (id: string) => {
    const local = await getLocalContacts();
    // Show local immediately so contacts never appear missing
    setContacts(local);
    try {
      const remote = await api.getContacts(id);
      const merged = mergeContacts(remote, local);
      setContacts(merged);
      await saveLocalContacts(merged);
    } catch (e) {
      console.error('Failed to load contacts from backend, using local only:', e);
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    const phone = newPhone.trim();
    const relation = newRelation.trim();

    if (!name || !phone) {
      Alert.alert('Required', 'Please enter name and phone number');
      return;
    }

    // Ensure userId is set even if init hasn't completed
    let activeUserId = userId;
    if (!activeUserId) {
      activeUserId = (await AsyncStorage.getItem('user_id')) || 'local-' + Date.now();
      await AsyncStorage.setItem('user_id', activeUserId);
      setUserId(activeUserId);
    }

    setSaving(true);

    // Build a local contact immediately (offline-first)
    const localContact: Contact = {
      contact_id: 'local-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      user_id: activeUserId,
      name,
      phone,
      relation,
      created_at: new Date().toISOString(),
    };

    const currentList = await getLocalContacts();
    const optimisticList = [localContact, ...currentList];
    await saveLocalContacts(optimisticList);
    setContacts((prev) => [localContact, ...prev]);

    // Reset form and close modal right away — user sees success
    setShowAddModal(false);
    setNewName('');
    setNewPhone('');
    setNewRelation('');
    setSaving(false);

    // Try to sync with backend in the background
    try {
      const saved = await api.addContact({
        user_id: activeUserId,
        name,
        phone,
        relation,
      });
      // Replace the local placeholder with the server contact id
      const replacedList = optimisticList.map((c) =>
        c.contact_id === localContact.contact_id ? saved : c
      );
      await saveLocalContacts(replacedList);
      setContacts((prev) =>
        prev.map((c) => (c.contact_id === localContact.contact_id ? saved : c))
      );
    } catch (e: any) {
      // Backend sync failed — contact is still saved locally, so don't show a failure
      console.warn('Contact saved locally, backend sync failed:', e?.message || e);
    }
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // Optimistically remove locally
            const updated = (await getLocalContacts()).filter(
              (c) => c.contact_id !== contact.contact_id
            );
            await saveLocalContacts(updated);
            setContacts((prev) => prev.filter((c) => c.contact_id !== contact.contact_id));

            // Try backend delete only if it's a server-side contact
            if (!contact.contact_id.startsWith('local-')) {
              try {
                await api.deleteContact(contact.contact_id);
              } catch (e) {
                console.warn('Backend delete failed (kept removed locally):', e);
              }
            }
          },
        },
      ]
    );
  };

  const renderContact = useCallback(
    ({ item }: { item: Contact }) => (
      <View testID={`contact-card-${item.contact_id}`} style={styles.contactCard}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          {item.relation ? <Text style={styles.contactRelation}>{item.relation}</Text> : null}
        </View>
        <TouchableOpacity
          testID={`delete-contact-${item.contact_id}`}
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    ),
    [userId]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF3B30" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Emergency Contacts</Text>
            <Text style={styles.subtitle}>
              {contacts.length > 0
                ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''} will be notified during SOS`
                : 'Add contacts to notify during emergencies'}
            </Text>
          </View>
        </View>

        {/* Contacts List */}
        {contacts.length > 0 ? (
          <FlatList
            data={contacts}
            keyExtractor={(item) => item.contact_id}
            renderItem={renderContact}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="people-outline" size={64} color="#E5E0D8" />
            </View>
            <Text style={styles.emptyTitle}>No Emergency Contacts</Text>
            <Text style={styles.emptyDesc}>
              Add trusted contacts who will be notified when you trigger an SOS alert
            </Text>
          </View>
        )}

        {/* Add Button */}
        <TouchableOpacity
          testID="add-contact-btn"
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#FFF" />
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>

        {/* Add Contact Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Emergency Contact</Text>
                <TouchableOpacity
                  testID="close-modal-btn"
                  onPress={() => setShowAddModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#595D62" />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                testID="contact-name-input"
                style={styles.input}
                placeholder="Contact name"
                placeholderTextColor="#595D62"
                value={newName}
                onChangeText={setNewName}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <TextInput
                testID="contact-phone-input"
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#595D62"
                value={newPhone}
                onChangeText={setNewPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>RELATION (OPTIONAL)</Text>
              <TextInput
                testID="contact-relation-input"
                style={styles.input}
                placeholder="e.g. Mom, Dad, Friend"
                placeholderTextColor="#595D62"
                value={newRelation}
                onChangeText={setNewRelation}
              />

              <TouchableOpacity
                testID="save-contact-btn"
                style={[styles.saveBtn, (!newName.trim() || !newPhone.trim()) && styles.saveBtnDisabled]}
                onPress={handleAdd}
                disabled={!newName.trim() || !newPhone.trim() || saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Contact</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9F6F0' },
  container: { flex: 1, padding: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 24 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1C1E',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#595D62',
    marginTop: 4,
  },
  list: { paddingBottom: 100 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#1A1C1E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  contactInfo: { flex: 1 },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1C1E',
  },
  contactPhone: {
    fontSize: 14,
    color: '#595D62',
    marginTop: 2,
  },
  contactRelation: {
    fontSize: 12,
    color: '#5856D6',
    fontWeight: '500',
    marginTop: 2,
  },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0EBE1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1C1E',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: '#595D62',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  addButton: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    borderRadius: 9999,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: '#F9F6F0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1C1E',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#595D62',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F0EBE1',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1A1C1E',
  },
  saveBtn: {
    backgroundColor: '#FF3B30',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
