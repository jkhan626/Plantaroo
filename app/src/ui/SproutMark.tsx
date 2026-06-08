/** The Plantaroo sprout mark, as a vector — matches the app icon glyph. */
import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { colors } from '../theme';

const LEAF = 'M0,0 C 9.7,-7.2 9.7,-25.7 0,-34 C -9.7,-25.7 -9.7,-7.2 0,0 Z';

export function SproutMark({
  size = 88,
  color = colors.white,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G transform="translate(50 56)">
        <Path
          d="M0,32 C -1,18 -0.8,9 0,0"
          stroke={color}
          strokeWidth={4.6}
          strokeLinecap="round"
          fill="none"
        />
        <G transform="rotate(-34)">
          <Path d={LEAF} fill={color} />
        </G>
        <G transform="rotate(34)">
          <Path d={LEAF} fill={color} />
        </G>
      </G>
    </Svg>
  );
}
