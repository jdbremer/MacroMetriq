import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ScrollView } from 'react-native';
import { supabase } from '../../utils/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <ThemedText type="title" style={{ color: '#EAEAEA' }}>More</ThemedText>
      </ThemedView>
      
      <ScrollView style={styles.scrollView}>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/account-settings')}
        >
          <ThemedText style={styles.menuText}>Account Settings</ThemedText>
          <ThemedText style={styles.chevron}>›</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/goals')}
        >
          <ThemedText style={styles.menuText}>Goals</ThemedText>
          <ThemedText style={styles.chevron}>›</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {}}
        >
          <ThemedText style={styles.menuText}>Integrations</ThemedText>
          <ThemedText style={styles.chevron}>›</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => {}}
        >
          <ThemedText style={styles.menuText}>Units</ThemedText>
          <ThemedText style={styles.chevron}>›</ThemedText>
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
  scrollView: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: 'rgba(18,18,18,0.95)',
  },
  menuText: {
    fontSize: 16,
    color: '#EAEAEA',
  },
  chevron: {
    fontSize: 24,
    color: '#9E9E9E',
  },
});