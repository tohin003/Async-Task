/** Compare the browser origin to the public host, not Next's internal server URL. */
export function hasAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const internal = new URL(request.url);
    const protocol =
      request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
      internal.protocol.slice(0, -1);
    if (!['http', 'https'].includes(protocol)) return false;
    const host =
      request.headers.get('host') ||
      request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
      internal.host;
    const expected = new URL(`${protocol}://${host}`);
    const incoming = new URL(origin);
    return (
      !expected.username &&
      !expected.password &&
      incoming.origin === origin &&
      incoming.origin === expected.origin
    );
  } catch {
    return false;
  }
}
