import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography, spacing } from '../../theme/tokens';
import { useI18n } from '../../i18n';

interface BookshelfFooterProps {
  onNavigate: (route: string) => void;
}

export function BookshelfFooter({ onNavigate }: BookshelfFooterProps) {
  const { t } = useI18n();
  return (
    <View style={styles.footerContainer}>
      <View style={styles.footerLinksRow}>
        <TouchableOpacity onPress={() => onNavigate('/privacy')}>
          <Text style={styles.footerLinkText}>{t('settings.privacy')}</Text>
        </TouchableOpacity>
        <Text style={styles.footerDivider}>•</Text>
        <TouchableOpacity onPress={() => onNavigate('/terms')}>
          <Text style={styles.footerLinkText}>{t('settings.terms')}</Text>
        </TouchableOpacity>
        <Text style={styles.footerDivider}>•</Text>
        <TouchableOpacity onPress={() => onNavigate('/security')}>
          <Text style={styles.footerLinkText}>{t('settings.security')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.footerCopyright}>
        {t('branding.footer')}
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
