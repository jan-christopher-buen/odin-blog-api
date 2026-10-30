import { configuration } from './config.js';
import { prisma } from './prisma.js';
import { createApp } from './app.js';
const config = configuration();
await prisma.$connect();
const server = createApp(prisma, config).listen(
  process.env.PORT || 3000,
  '0.0.0.0',
  () => console.log('Margin API is listening'),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
