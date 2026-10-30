import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { routes } from './routes.js';
import { errorHandler } from './errors.js';
export function createApp(db, config, limits) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.hops);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || config.origins.includes(origin)),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(
    '/api',
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    routes(db, config, limits),
  );
  app.use((_req, res) => res.status(404).json({ error: 'Resource not found' }));
  app.use(errorHandler);
  return app;
}
