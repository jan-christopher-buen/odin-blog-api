import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { HttpError } from './errors.js';
export const publicUser = {
  id: true,
  username: true,
  displayName: true,
  role: true,
};
export function authMiddleware(db, config) {
  return async (req, _res, next) => {
    const header = req.get('Authorization') || '';
    if (!/^Bearer [^\s]+$/i.test(header))
      throw new HttpError(401, 'Authentication required');
    let payload;
    try {
      payload = jwt.verify(header.slice(7), config.secret, {
        algorithms: ['HS256'],
        issuer: config.issuer,
        audience: config.audience,
      });
    } catch {
      throw new HttpError(401, 'Authentication required');
    }
    if (
      typeof payload.sub !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        payload.sub,
      )
    )
      throw new HttpError(401, 'Authentication required');
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: publicUser,
    });
    if (!user) throw new HttpError(401, 'Authentication required');
    if (user.role !== 'AUTHOR')
      throw new HttpError(403, 'Author access required');
    req.user = user;
    next();
  };
}
export function loginController(db, config) {
  // A fixed-cost comparison also runs for unknown usernames.
  const dummy = bcrypt.hash('unusable-placeholder', 12);
  return async (req, res) => {
    const user = await db.user.findUnique({
      where: { username: req.body.username },
    });
    const valid = await bcrypt.compare(
      req.body.password,
      user?.passwordHash || (await dummy),
    );
    if (!valid || user?.role !== 'AUTHOR')
      throw new HttpError(401, 'Invalid username or password');
    const token = jwt.sign({}, config.secret, {
      algorithm: 'HS256',
      subject: user.id,
      issuer: config.issuer,
      audience: config.audience,
      expiresIn: config.expiry,
    });
    res.json({
      token,
      user: Object.fromEntries(
        Object.keys(publicUser).map((k) => [k, user[k]]),
      ),
    });
  };
}
