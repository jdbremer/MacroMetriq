import React, { useState, useEffect } from 'react';
import { StyleSheet, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { supabase } from '../utils/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
    else router.replace('/login');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backText}>‹</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title" style={{ color: '#EAEAEA' }}>Account Settings</ThemedText>
      </ThemedView>
      
      <ScrollView style={styles.scrollView}>
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionLabel}>Email</ThemedText>
          <ThemedText style={styles.sectionValue}>{user?.email}</ThemedText>
        </ThemedView>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    bottom: 16,
  },
  backText: {
    fontSize: 32,
    color: '#EAEAEA',
    fontWeight: '300',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  sectionLabel: {
    fontSize: 12,
    color: '#9E9E9E',
    marginBottom: 4,
  },
  sectionValue: {
    fontSize: 16,
    color: '#EAEAEA',
  },
  signOutButton: {
    marginTop: 32,
    marginHorizontal: 20,
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutText: {
    color: '#EAEAEA',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
