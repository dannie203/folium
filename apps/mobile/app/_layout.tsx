import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { getDatabase } from '../src/db';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    getDatabase()
      .then(() => setIsReady(true))
      .catch((err) => console.error('Failed to initialize local database:', err));
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#18181B' },
          headerTintColor: '#FAFAFA',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#09090B' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Folium',
            headerLargeTitle: false,
          }}
        />
        <Stack.Screen
          name="reader/[id]"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
