import React, { useState } from 'react';
import { View, StyleSheet, Alert, TextInput } from 'react-native';
import { supabase } from '../utils/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const signInWithEmail = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) Alert.alert('Error', error.message);
    else router.replace('/dashboard');
  };

  const signUpWithEmail = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Success', 'Check your email for verification!');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Welcome to Evolve</ThemedText>
      
      <View style={styles.loginForm}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.button} onPress={isSignUp ? signUpWithEmail : signInWithEmail}>
          <ThemedText style={styles.buttonText}>{isSignUp ? 'Sign Up' : 'Login'}</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <ThemedText style={styles.switchText}>
            {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign up"}
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  loginForm: {
    width: '100%',
    maxWidth: 300,
  },
  input: {
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    backgroundColor: '#2A2A2A',
    color: '#EAEAEA',
  },
  button: {
    backgroundColor: '#2A2A2A',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#EAEAEA',
    fontWeight: '600',
  },
  switchText: {
    textAlign: 'center',
    marginTop: 15,
    color: '#EAEAEA',
  },
});