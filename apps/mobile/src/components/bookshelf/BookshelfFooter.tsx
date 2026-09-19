import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing } from '../../theme/tokens';

interface BookshelfFooterProps {
  onNavigate: (route: string) => void;
}

export function BookshelfFooter({ onNavigate }: BookshelfFooterProps) {
  return (
    <View style={styles.footerContainer}>
      <View style={styles.footerLinksRow}>
        <TouchableOpacity onPress={() => onNavigate('/privacy')}>
          <Text style={styles.footerLinkText}>Quyền riêng tư</Text>
        </TouchableOpacity>
        <Text style={styles.footerDivider}>•</Text>
        <TouchableOpacity onPress={() => onNavigate('/terms')}>
          <Text style={styles.footerLinkText}>Điều khoản & DMCA</Text>
        </TouchableOpacity>
        <Text style={styles.footerDivider}>•</Text>
        <TouchableOpacity onPress={() => onNavigate('/security')}>
          <Text style={styles.footerLinkText}>Bảo mật ZK</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.footerCopyright}>
        Folium 🍃 Local-First & Zero-Knowledge E-Reader
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
    gap: 8,
  },
  footerLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerLinkText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.caption,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    color: colors.borderSubtle,
    fontSize: typography.fontSize.caption,
  },
  footerCopyright: {
    color: colors.textMuted,
    fontSize: typography.fontSize.micro,
    marginTop: 4,
  },
});
