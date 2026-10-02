import React from 'react';
import { Platform } from 'react-native';
import Svg, { Path, Circle, Line, Rect, Polyline, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const TAG_MAP: Record<string, any> = {
  path: Path,
  circle: Circle,
  line: Line,
  rect: Rect,
  polyline: Polyline,
  g: G,
};

function convertNodeToNativeSvg(node: React.ReactNode): React.ReactNode {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((child, idx) => {
      const converted = convertNodeToNativeSvg(child);
      return React.isValidElement(converted) ? React.cloneElement(converted, { key: idx }) : converted;
    });
  }
  if (React.isValidElement(node)) {
    const type = node.type;
    if (type === React.Fragment) {
      return React.Children.map(node.props.children, convertNodeToNativeSvg);
    }
    const NativeComponent = typeof type === 'string' ? TAG_MAP[type] : type;
    if (NativeComponent) {
      const convertedChildren = node.props.children
        ? React.Children.map(node.props.children, convertNodeToNativeSvg)
        : undefined;
      return React.createElement(NativeComponent, node.props, convertedChildren);
    }
  }
  return node;
}

function renderSvg(
  size: number,
  color: string,
  strokeWidth: number,
  paths: React.ReactNode,
  viewBox: string = '0 0 24 24',
  fillRule: 'stroke' | 'fill' = 'stroke'
) {
  if (Platform.OS === 'web') {
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox,
        fill: fillRule === 'fill' ? color : 'none',
        stroke: fillRule === 'stroke' ? color : 'none',
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'inline-block', verticalAlign: 'middle' },
      },
      paths
    );
  }

  // Native SVG rendering via react-native-svg
  const nativeChildren = convertNodeToNativeSvg(paths);
  return (
    <Svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fillRule === 'fill' ? color : 'none'}
      stroke={fillRule === 'stroke' ? color : 'none'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nativeChildren}
    </Svg>
  );
}

// 🍃 Folium Leaf Logo Icon
export const FoliumLeafIcon: React.FC<IconProps> = ({ size = 24, color = '#6366F1', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M11 20A7 7 0 0 1 4 13C4 8 8 3 19 3C19 14 15 20 11 20Z',
      }),
      React.createElement('path', {
        d: 'M4 13C8.5 13 13 8.5 13 4',
      }),
      React.createElement('path', {
        d: 'M9 15L15 9',
      })
    )
  );
};

// 🔍 Search Icon
export const SearchIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('circle', { cx: 11, cy: 11, r: 7 }),
      React.createElement('path', { d: 'M21 21L16 16' })
    )
  );
};

// ⚡ Sync / Refresh Icon
export const SyncIcon: React.FC<IconProps & { spinning?: boolean }> = ({
  size = 16,
  color = '#10B981',
  strokeWidth = 1.75,
}) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M21.5 2v6h-6' }),
      React.createElement('path', { d: 'M2.5 22v-6h6' }),
      React.createElement('path', {
        d: 'M2.5 11.5a10 10 0 0 1 17-4.5L21.5 8M2.5 16l2 1a10 10 0 0 0 17-4.5',
      })
    )
  );
};

// ☁️ Cloud / Drive Icon
export const CloudDriveIcon: React.FC<IconProps> = ({ size = 16, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('path', {
      d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
    })
  );
};

// 🌐 Community / Globe Icon
export const CommunityGlobeIcon: React.FC<IconProps> = ({ size = 16, color = '#6366F1', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
      React.createElement('path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }),
      React.createElement('path', { d: 'M2 12h20' })
    )
  );
};

// ➕ Plus / Add Icon
export const PlusIcon: React.FC<IconProps> = ({ size = 16, color = '#FFFFFF', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M12 5v14' }),
      React.createElement('path', { d: 'M5 12h14' })
    )
  );
};

// 📖 Book / Library Icon
export const BookLibraryIcon: React.FC<IconProps> = ({ size = 20, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z' }),
      React.createElement('path', { d: 'M6 6h10' }),
      React.createElement('path', { d: 'M6 10h10' })
    )
  );
};

// ⚙️ Settings Icon
export const SettingsIcon: React.FC<IconProps> = ({ size = 20, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('circle', { cx: 12, cy: 12, r: 3 }),
      React.createElement('path', {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z',
      })
    )
  );
};

// 📥 Inbox Tray Icon
export const InboxTrayIcon: React.FC<IconProps> = ({ size = 14, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }),
      React.createElement('path', {
        d: 'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      })
    )
  );
};

// 📁 Folder Icon
export const FolderIcon: React.FC<IconProps> = ({ size = 14, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('path', {
      d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    })
  );
};

// ✏️ Edit Pencil Icon
export const EditPencilIcon: React.FC<IconProps> = ({ size = 14, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('path', {
      d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
    })
  );
};

// 🗑️ Trash Icon
export const TrashIcon: React.FC<IconProps> = ({ size = 16, color = '#EF4444', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M3 6h18' }),
      React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
      React.createElement('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' })
    )
  );
};

// ❌ Close Icon
export const CloseIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M18 6L6 18' }),
      React.createElement('path', { d: 'M6 6l12 12' })
    )
  );
};

// ✓ Check Icon
export const CheckIcon: React.FC<IconProps> = ({ size = 16, color = '#10B981', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('polyline', { points: '20 6 9 17 4 12' })
  );
};

// 📑 Bookmark Icon
export const BookmarkIcon: React.FC<IconProps & { filled?: boolean }> = ({
  size = 18,
  color = '#A1A1AA',
  strokeWidth = 1.75,
  filled = false,
}) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('path', { d: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z' }),
    '0 0 24 24',
    filled ? 'fill' : 'stroke'
  );
};

// 📋 Table of Contents List Icon
export const ListTocIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('line', { x1: 8, y1: 6, x2: 21, y2: 6 }),
      React.createElement('line', { x1: 8, y1: 12, x2: 21, y2: 12 }),
      React.createElement('line', { x1: 8, y1: 18, x2: 21, y2: 18 }),
      React.createElement('line', { x1: 3, y1: 6, x2: 3.01, y2: 6 }),
      React.createElement('line', { x1: 3, y1: 12, x2: 3.01, y2: 12 }),
      React.createElement('line', { x1: 3, y1: 18, x2: 3.01, y2: 18 })
    )
  );
};

// ← Arrow Left Icon
export const ArrowLeftIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('line', { x1: 19, y1: 12, x2: 5, y2: 12 }),
      React.createElement('polyline', { points: '12 19 5 12 12 5' })
    )
  );
};

// ‹ Chevron Left Icon
export const ChevronLeftIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('polyline', { points: '15 18 9 12 15 6' })
  );
};

// › Chevron Right Icon
export const ChevronRightIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 2 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('polyline', { points: '9 18 15 12 9 6' })
  );
};

// Aa Text Font Icon
export const TextAaIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('polyline', { points: '4 20 8 7 12 20' }),
      React.createElement('line', { x1: 5.5, y1: 15, x2: 10.5, y2: 15 }),
      React.createElement('polyline', { points: '14 20 17 11 20 20' }),
      React.createElement('line', { x1: 15, y1: 16.5, x2: 19, y2: 16.5 })
    )
  );
};

// 🔊 Speaker / Audio Icon
export const SpeakerIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
      React.createElement('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }),
      React.createElement('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' })
    )
  );
};

// ▶ Play Icon
export const PlayIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement('polygon', { points: '5 3 19 12 5 21 5 3' }),
    '0 0 24 24',
    'fill'
  );
};

// ⏸ Pause Icon
export const PauseIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('rect', { x: 6, y: 4, width: 4, height: 16 }),
      React.createElement('rect', { x: 14, y: 4, width: 4, height: 16 })
    ),
    '0 0 24 24',
    'fill'
  );
};

// |◀ Skip Back Icon
export const SkipBackIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('polygon', { points: '19 20 9 12 19 4 19 20' }),
      React.createElement('line', { x1: 5, y1: 19, x2: 5, y2: 5 })
    )
  );
};

// ▶| Skip Forward Icon
export const SkipForwardIcon: React.FC<IconProps> = ({ size = 18, color = '#A1A1AA', strokeWidth = 1.75 }) => {
  return renderSvg(
    size,
    color,
    strokeWidth,
    React.createElement(
      React.Fragment,
      null,
      React.createElement('polygon', { points: '5 4 15 12 5 20 5 4' }),
      React.createElement('line', { x1: 19, y1: 5, x2: 19, y2: 19 })
    )
  );
};


