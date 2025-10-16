// index.js — run polyfills BEFORE Expo Router so GLTFLoader has Base64/atob/btoa
import './utils/polyfills';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import 'react-native-url-polyfill/auto';

export { default } from 'expo-router/entry';

