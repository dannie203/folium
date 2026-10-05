// ==============================================================================
//  FOLIUM DESIGN TOKENS (v1.0)
//  "The Quiet Sanctuary" — Dark Zinc & Folium Iris Design System (From foundation.html)
// ==============================================================================

export const colors = {
  // Canvas & Backgrounds (The Quiet Sanctuary)
  bgBase: '#0A0A0C',       // Main viewport canvas
  bgSurface: '#121215',    // Elevated cards, drawers, quiet panels
  bgElevated: '#18181D',   // Modals, popovers, active tooltips
  bgOverlay: 'rgba(10, 10, 12, 0.75)',

  // Borders & Dividers
  borderHairline: 'rgba(255, 255, 255, 0.07)', // Hairline divider
  borderSubtle: '#222227', // Subtle border
  borderMedium: '#32323A', // Medium border / hover state
  borderFocus: '#818CF8',  // Soft Iris - Keyboard focus

  // Typography & Content (WCAG AA accessible >= 4.5:1)
  textPrimary: '#EDEDF0',  // High contrast reading text (17.8:1)
  textSecondary: '#9A9AA3',// Authors, metadata, captions (7.4:1)
  textMuted: '#7C7C87',    // Metadata, footnotes (4.5:1 on base)

  // Brand & Accents
  accentPrimary: '#818CF8', // Folium Iris
  accentBookmark: '#C49B66',// Warm bookmark ribbon for reading progress

  // Status & Synchronization
  statusSuccess: '#10B981',// Emerald - Synced / Done
  statusSyncing: '#F59E0B',// Amber - Sync in progress
  statusOffline: '#7C7C87',// Zinc - Local offline mode
  statusError: '#EF4444',  // Red - Error / Destructive action

  // Reader Tri-Theme Engine (From foundation.html)
  reader: {
    dark: {
      bg: '#0A0A0C',
      surface: '#121215',
      text: '#EDEDF0',
      border: '#222227',
      subtext: '#9A9AA3',
    },
    sepia: {
      bg: '#EDE0C8',
      surface: '#F3E8D3',
      text: '#3B2F20',
      border: '#DCCBA9',
      subtext: '#66543C',
    },
    light: {
      bg: '#F6F3EC',
      surface: '#FBF9F4',
      text: '#1E1D1A',
      border: '#E4DFD3',
      subtext: '#5E5B53',
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
  fontFamily: {
    serif: 'Newsreader, Charter, "Iowan Old Style", "Source Han Serif SC", "Noto Serif CJK SC", "Noto Serif CJK JP", Georgia, serif',
    sans: 'Avenir Next, Helvetica Neue, Noto Sans CJK SC, Noto Sans CJK JP, sans-serif',
  },
  fontSize: {
    display: 32,
    titleLg: 22,
    titleMd: 16,
    body: 14,
    caption: 12,
    micro: 10,
  },
  lineHeight: {
    display: 40,
    titleLg: 28,
    titleMd: 22,
    body: 20,
    caption: 16,
    micro: 14,
    reader: 1.8,
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
  huge: 48,
  colossal: 72,
};

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  full: 9999,
};
