// ==============================================================================
//  FOLIUM DESIGN TOKENS (v1.0)
//  "The Quiet Sanctuary" — Dark Zinc & Folium Indigo Design System
// ==============================================================================

export const colors = {
  // Canvas & Backgrounds
  bgBase: '#0D120F',       // Deep moss-black reading room canvas
  bgSurface: '#151C17',    // Elevated cards, drawers, search input
  bgElevated: '#202A21',   // Modals, popovers, active tooltips
  bgOverlay: 'rgba(13, 18, 15, 0.78)',

  // Borders & Dividers
  borderSubtle: '#2A382D', // Moss 800 - 1px hairline border
  borderMedium: '#405143', // Moss 700 - Hover border state
  borderFocus: '#B8E36B',  // Folium Leaf - Keyboard focus / active input

  // Typography & Content
  textPrimary: '#F1F3E9',  // Warm white - Titles, reading text
  textSecondary: '#AAB5A8',// Moss gray - Authors, metadata, captions
  textMuted: '#748176',    // Moss gray - Placeholders, disabled states

  // Brand & Accents
  accentPrimary: '#B8E36B',// Folium Leaf (Lime 300)
  accentText: '#17210F',   // Text on leaf-colored controls

  // Status & Synchronization
  statusSuccess: '#10B981',// Emerald 500 - Synced to Edge
  statusSyncing: '#F59E0B',// Amber 500 - Sync in progress
  statusOffline: '#71717A',// Zinc 500 - Local offline mode
  statusError: '#EF4444',  // Red 500 - Error / Alert

  // Reader Tri-Theme Engine
  reader: {
    dark: {
      bg: '#09090B',
      surface: '#141417',
      text: '#E4E4E7',
      border: '#27272A',
      subtext: '#A1A1AA',
    },
    sepia: {
      bg: '#FBF0D9',
      surface: '#F4E4C1',
      text: '#422B11',
      border: '#E5D3AF',
      subtext: '#7C6F59',
    },
    light: {
      bg: '#FFFFFF',
      surface: '#F4F4F5',
      text: '#18181B',
      border: '#E4E4E7',
      subtext: '#71717A',
    },
    highlights: {
      yellow: 'rgba(250, 204, 21, 0.35)',
      green: 'rgba(52, 211, 153, 0.35)',
      blue: 'rgba(96, 165, 250, 0.35)',
      pink: 'rgba(244, 114, 182, 0.35)',
      purple: 'rgba(192, 132, 252, 0.35)',
    },
  },
} as const;

export const typography = {
  fontSize: {
    display: 24,
    titleLg: 18,
    titleMd: 15,
    body: 14,
    caption: 12,
    micro: 10,
  },
  lineHeight: {
    display: 32,
    titleLg: 24,
    titleMd: 20,
    body: 20,
    caption: 16,
    micro: 14,
    reader: 1.65,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};
