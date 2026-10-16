function isPrivateOrInternalHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }

  // IPv4 check
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      parseInt(ipv4Match[1], 10),
      parseInt(ipv4Match[2], 10),
      parseInt(ipv4Match[3], 10),
      parseInt(ipv4Match[4], 10),
    ];
    if (octets.some((o) => o > 255)) return true;
    if (octets[0] === 127) return true; // Loopback
    if (octets[0] === 10) return true; // Private 10.x.x.x
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true; // Private 172.16-31.x.x
    if (octets[0] === 192 && octets[1] === 168) return true; // Private 192.168.x.x
    if (octets[0] === 169 && octets[1] === 254) return true; // Link-local / Cloud metadata
    if (octets[0] === 0) return true;
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
    if (octets[0] >= 224) return true;
    // Reject any raw IPv4 as target host
    return true;
  }

  // IPv6 check
  if (lower.startsWith('[') || lower.includes(':')) {
    return true;
  }

  return false;
}

export function validateDownloadTargetUrl(rawUrl: string): { valid: boolean; url?: URL; error?: string } {
  let targetUrl: URL;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Enforce strict HTTPS
  if (targetUrl.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS protocol is permitted' };
  }

  // Check for non-standard port
  if (targetUrl.port && targetUrl.port !== '443') {
    return { valid: false, error: 'Non-standard port is forbidden' };
  }

  const hostname = targetUrl.hostname.toLowerCase();

  // Block private and internal network targets
  if (isPrivateOrInternalHost(hostname)) {
    return { valid: false, error: 'Access to private or internal network targets is prohibited' };
  }

  // Strict domain allowlist
  const isAllowedDomain =
    hostname === 'standardebooks.org' ||
    hostname.endsWith('.standardebooks.org') ||
    hostname === 'gutenberg.org' ||
    hostname === 'www.gutenberg.org' ||
    hostname.endsWith('.gutenberg.org');

  if (!isAllowedDomain) {
    return { valid: false, error: 'Forbidden download host (not on allowlist)' };
  }

  return { valid: true, url: targetUrl };
}
