import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        lazy: false,
        tabBarActiveTintColor: '#EAEAEA',
        tabBarInactiveTintColor: '#9E9E9E',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: 88,
          paddingBottom: 34,
          paddingTop: 8,
          borderTopWidth: 0,
          backgroundColor: '#121212',
          ...Platform.select({
            ios: {
              position: 'absolute',
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="fitness"
        options={{
          title: 'Fitness',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="figure.run" color={color} />,
        }}
      />
        <Tabs.Screen
            name="meals"
            options={{
                title: 'Meals',
                tabBarIcon: ({ color }) => <IconSymbol size={24} name="fork.knife" color={color} />,
                tabBarIcon: ({ color }) => <IconSymbol size={24} name="fork.knife" color={color} />,
            }}
        />
        <Tabs.Screen
            name="more"
            options={{
                title: 'More',
                tabBarIcon: ({ color }) => <IconSymbol size={24} name="menucard" color={color} />,
            }}
        />
    </Tabs>
  );
}
