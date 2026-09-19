// ==============================================================================
//  FOLIUM DESIGN TOKENS (v1.0)
//  "The Quiet Sanctuary" — Dark Zinc & Folium Indigo Design System
// ==============================================================================

export const colors = {
  // Canvas & Backgrounds
  bgBase: '#09090B',       // Zinc 950 - Main viewport canvas
  bgSurface: '#141417',    // Elevated cards, drawers, search input
  bgElevated: '#1F1F23',   // Modals, popovers, active tooltips
  bgOverlay: 'rgba(9, 9, 11, 0.75)',

  // Borders & Dividers
  borderSubtle: '#27272A', // Zinc 800 - 1px hairline border
  borderMedium: '#3F3F46', // Zinc 700 - Hover border state
  borderFocus: '#6366F1',  // Folium Indigo - Keyboard focus / active input

  // Typography & Content
  textPrimary: '#F4F4F5',  // Zinc 100 - Titles, reading text (WCAG AAA 17.8:1)
  textSecondary: '#A1A1AA',// Zinc 400 - Authors, metadata, captions (WCAG AA 7.4:1)
  textTertiary: '#71717A', // Zinc 500 - Secondary captions, placeholders
  textMuted: '#71717A',    // Zinc 500 - Placeholders, disabled states

  // Brand & Accents
  accentPrimary: '#6366F1',// Folium Indigo (Electric 500)
  accentHover: '#4F46E5',  // Folium Indigo (Deep 600)
  accentAmber: '#F59E0B',  // Amber 500 - Bookmarks / warning
  accentMuted: 'rgba(99, 102, 241, 0.15)',

  // Format Badges
  badgeEpub: '#4F46E5',    // Indigo 600
  badgeEpubBg: 'rgba(79, 70, 229, 0.15)',
  badgePdf: '#E11D48',     // Rose 600
  badgePdfBg: 'rgba(225, 29, 72, 0.15)',

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

export const readerThemes = colors.reader;


export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
    serif: '"Literata", "Merriweather", "Charter", Georgia, serif',
  },
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

export const shadows = {
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
};
