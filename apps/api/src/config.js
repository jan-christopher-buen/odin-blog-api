export function configuration(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!env.JWT_SECRET || Buffer.byteLength(env.JWT_SECRET) < 32)
    throw new Error(
      'JWT_SECRET must contain at least 32 bytes of private random material',
    );
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5)
    throw new Error('Invalid TRUST_PROXY_HOPS');
  const expiry = env.JWT_EXPIRES_IN || '1h';
  if (!/^([1-9]\d{0,5})(s|m|h)$/.test(expiry))
    throw new Error('Invalid JWT_EXPIRES_IN');
  const origins = (env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of origins)
    if (new URL(origin).origin !== origin)
      throw new Error('Use exact frontend origins');
  return {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER || 'margin-api',
    audience: env.JWT_AUDIENCE || 'margin-author',
    expiry,
    hops,
    origins,
  };
}
