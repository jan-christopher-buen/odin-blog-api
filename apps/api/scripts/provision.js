import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';
try {
  const username = process.env.AUTHOR_USERNAME?.trim().toLowerCase();
  const displayName = process.env.AUTHOR_DISPLAY_NAME?.trim();
  const password = process.env.AUTHOR_PASSWORD;
  if (
    !/^[a-z0-9_-]{3,40}$/.test(username || '') ||
    !displayName ||
    displayName.length > 80 ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  )
    throw new Error(
      'Supply a valid AUTHOR_USERNAME, AUTHOR_DISPLAY_NAME, and private AUTHOR_PASSWORD (12+ characters, at most 72 UTF-8 bytes)',
    );
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    if (existing.role !== 'AUTHOR')
      throw new Error(
        'Username belongs to a non-author; refusing to change privileges',
      );
    console.log('Author already exists; password and profile unchanged.');
  } else {
    await prisma.user.create({
      data: {
        username,
        displayName,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'AUTHOR',
      },
    });
    console.log('Author provisioned.');
  }
} finally {
  await prisma.$disconnect();
}
