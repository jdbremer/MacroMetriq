import React, { useState, useEffect } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '../utils/supabase';

export default function Index() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  
  return user ? <Redirect href="/dashboard" /> : <Redirect href="/login" />;
}