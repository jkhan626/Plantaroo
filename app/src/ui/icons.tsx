/** SVG icon set — Feather-style strokes, no emoji (per the design rules). */
import React from 'react';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors } from '../theme';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function base(size = 22, strokeWidth = 2) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export const Droplet = ({ size, color = colors.green, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </Svg>
);

export const DropletFill = ({ size = 22, color = colors.green }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </Svg>
);

export const Sprout = ({ size, color = colors.green, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M12 22V11" />
    <Path d="M12 11C12 7 9 4 5 4c0 4 3 7 7 7z" />
    <Path d="M12 13c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z" />
  </Svg>
);

export const Leaf = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
    <Path d="M2 21c0-3 1.85-5.36 5.08-6" />
  </Svg>
);

export const Plus = ({ size, color = colors.black, strokeWidth = 2.4 }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

export const Camera = ({ size, color = colors.green, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <Circle cx="12" cy="13" r="4" />
  </Svg>
);

export const Check = ({ size, color = colors.green, strokeWidth = 2.4 }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="20 6 9 17 4 12" />
  </Svg>
);

export const X = ({ size, color = colors.textSecondary, strokeWidth = 2.2 }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

export const ChevronRight = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

export const ChevronLeft = ({ size, color = colors.textSecondary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="15 18 9 12 15 6" />
  </Svg>
);

export const ChevronDown = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="6 9 12 15 18 9" />
  </Svg>
);

export const Trash = ({ size, color = colors.red, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Svg>
);

export const Skip = ({ size, color = colors.textSecondary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="5 4 15 12 5 20 5 4" />
    <Line x1="19" y1="5" x2="19" y2="19" />
  </Svg>
);

export const Repot = ({ size, color = colors.orange, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Polyline points="23 4 23 10 17 10" />
    <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </Svg>
);

export const Bell = ({ size, color = colors.textSecondary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Svg>
);

export const Search = ({ size, color = colors.textMuted, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Circle cx="11" cy="11" r="8" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

export const Sun = ({ size, color = colors.orange, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Circle cx="12" cy="12" r="5" />
    <Line x1="12" y1="1" x2="12" y2="3" />
    <Line x1="12" y1="21" x2="12" y2="23" />
    <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <Line x1="1" y1="12" x2="3" y2="12" />
    <Line x1="21" y1="12" x2="23" y2="12" />
    <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </Svg>
);

export const Bulb = ({ size, color = colors.green, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M9 18h6" />
    <Path d="M10 22h4" />
    <Path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </Svg>
);

export const Gear = ({ size, color = colors.textSecondary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);

export const Clock = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Circle cx="12" cy="12" r="10" />
    <Polyline points="12 6 12 12 16 14" />
  </Svg>
);

export const ListIcon = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Line x1="8" y1="6" x2="21" y2="6" />
    <Line x1="8" y1="12" x2="21" y2="12" />
    <Line x1="8" y1="18" x2="21" y2="18" />
    <Line x1="3" y1="6" x2="3.01" y2="6" />
    <Line x1="3" y1="12" x2="3.01" y2="12" />
    <Line x1="3" y1="18" x2="3.01" y2="18" />
  </Svg>
);

export const Mist = ({ size, color = colors.lightBlue, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
    <Line x1="8" y1="19" x2="8" y2="21" />
    <Line x1="8" y1="13" x2="8" y2="15" />
    <Line x1="16" y1="19" x2="16" y2="21" />
    <Line x1="16" y1="13" x2="16" y2="15" />
    <Line x1="12" y1="21" x2="12" y2="23" />
    <Line x1="12" y1="15" x2="12" y2="17" />
  </Svg>
);

export const Sparkle = ({ size, color = colors.textSecondary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <Line x1="19" y1="17" x2="19" y2="21" />
    <Line x1="17" y1="19" x2="21" y2="19" />
  </Svg>
);

export const Scissors = ({ size, color = colors.orange, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Circle cx="6" cy="6" r="3" />
    <Circle cx="6" cy="18" r="3" />
    <Line x1="20" y1="4" x2="8.12" y2="15.88" />
    <Line x1="14.47" y1="14.48" x2="20" y2="20" />
    <Line x1="8.12" y1="9.88" x2="12" y2="12" />
  </Svg>
);

export const PlantPot = ({ size, color = colors.textTertiary, strokeWidth }: IconProps) => (
  <Svg {...base(size, strokeWidth)} stroke={color}>
    <Path d="M12 22V11" />
    <Path d="M12 11C12 7 9 4 5 4c0 4 3 7 7 7z" />
    <Path d="M12 13c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z" />
  </Svg>
);
