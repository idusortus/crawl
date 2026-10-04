import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GameProvider } from '../ui/providers/GameProvider';

// Root layout for the Expo Router tree.
//
// The GameProvider wraps the route tree so every screen can read `GameState` +
// `LoadedPack` through `useGameContext`. It sits inside SafeAreaProvider so the
// chrome (status bar / notches) is applied before the game tree renders.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <Slot />
      </GameProvider>
    </SafeAreaProvider>
  );
}
