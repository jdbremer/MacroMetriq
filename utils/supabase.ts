
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, processLock } from '@supabase/supabase-js'
import { Platform } from 'react-native'

export const supabase = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_KEY!,
    {
        auth: {
            storage: Platform.OS === 'web' ? undefined : AsyncStorage,
            autoRefreshToken: true,
            persistSession: Platform.OS !== 'web',
            detectSessionInUrl: false,
            lock: processLock,
        },
    })
