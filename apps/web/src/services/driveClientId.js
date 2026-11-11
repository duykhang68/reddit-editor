// Cloudflare/Vite build-time configuration always wins over a previously saved manual ID.
// Never store the configured value in localStorage: changing the deployment must take effect.
export function resolveDriveClientId(environmentValue, manuallySavedValue = '') {
  const configuredId = typeof environmentValue === 'string' ? environmentValue.trim() : '';
  const manualId = typeof manuallySavedValue === 'string' ? manuallySavedValue.trim() : '';
  return {clientId: configuredId || manualId, configured: Boolean(configuredId)};
}
