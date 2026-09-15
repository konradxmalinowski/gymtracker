import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, View } from 'react-native';

import { PressScale } from '@/components/gestures/PressScale';
import { color, radius } from '@/theme/tokens';

export interface PhotoGridCellProps {
  uri: string;
  accessibilityLabel: string;
  selected?: boolean | undefined;
  selectable?: boolean | undefined;
  onPress: () => void;
  testID?: string | undefined;
}

/**
 * One `PhotoGridScreen` cell - thumbnail-only (`files.getUri(\`${PROGRESS_PHOTO_DIRECTORY}/${thumbName}\`)`
 * resolved by the caller, never the full-resolution image; the acceptance
 * criterion this component exists to satisfy). A missing file on disk
 * (`Image`'s `onError`) renders a placeholder icon in place of the image -
 * never an infinite spinner with no failure path - via a per-cell `useState`
 * error flag flipped by `onError`, the same pattern this whole feature's
 * brief calls for in the grid, detail, and compare views alike.
 */
export function PhotoGridCell({
  uri,
  accessibilityLabel,
  selected = false,
  selectable = false,
  onPress,
  testID,
}: PhotoGridCellProps) {
  const [failed, setFailed] = useState(false);

  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selectable ? { selected } : undefined}
      testID={testID}
    >
      <View
        style={{
          aspectRatio: 1,
          borderRadius: radius.md,
          overflow: 'hidden',
          backgroundColor: color.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selectable && selected ? 2 : 0,
          borderColor: color.accent,
        }}
      >
        {failed ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Ionicons name="image-outline" size={28} color={color.textTertiary} />
          </View>
        ) : (
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
        )}
        {selectable && selected ? (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              backgroundColor: color.accent,
              borderRadius: radius.full,
              width: 22,
              height: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={16} color={color.textInverse} />
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}
