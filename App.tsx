import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

// Milestone 1 is headless: this placeholder only proves the Expo app boots.
// The real UI arrives in Stage 5 (src/ui + expo-router under src/app).
export default function App() {
  return (
    <View style={styles.container}>
      <Text>crawl — engine skeleton (headless M1)</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
