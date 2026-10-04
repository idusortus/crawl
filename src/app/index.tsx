import { GameScreen } from '../ui/screens/GameScreen';

// The single route: render the playable game screen (HUD + glyph map, with the
// recoverable pack-load error surface). The GameProvider that supplies
// `{ state, pack, dispatch, error }` is mounted in `_layout.tsx`.
export default function IndexScreen() {
  return <GameScreen />;
}
