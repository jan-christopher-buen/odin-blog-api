import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authMiddleware, loginController } from './auth.js';
import { controllers } from './controllers.js';
import {
  pagination,
  id,
  validate,
  fieldsOnly,
  postRules,
  commentRules,
  loginRules,
} from './validation.js';
const limiter = (limit, windowMs) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });
export function routes(db, config, limits = {}) {
  const router = Router(),
    c = controllers(db),
    auth = authMiddleware(db, config);
  router.post(
    '/auth/login',
    limiter(limits.login || 10, 15 * 60 * 1000),
    fieldsOnly(['username', 'password']),
    loginRules,
    validate,
    loginController(db, config),
  );
  router.get('/auth/me', auth, (req, res) => res.json({ user: req.user }));
  router.get('/posts', pagination, validate, c.list(false));
  router.get('/posts/:postId', id('postId'), validate, c.detail(false));
  router.get(
    '/posts/:postId/comments',
    id('postId'),
    pagination,
    validate,
    c.comments(false),
  );
  router.post(
    '/posts/:postId/comments',
    limiter(limits.comment || 8, 60 * 1000),
    fieldsOnly(['displayName', 'body']),
    id('postId'),
    commentRules,
    validate,
    c.comment,
  );
  router.use('/author', auth);
  router.get('/author/posts', pagination, validate, c.list(true));
  router.post(
    '/author/posts',
    fieldsOnly(['title', 'excerpt', 'body', 'status']),
    postRules(),
    validate,
    c.create,
  );
  router.get('/author/posts/:postId', id('postId'), validate, c.detail(true));
  router.patch(
    '/author/posts/:postId',
    fieldsOnly(['title', 'excerpt', 'body', 'status'], true),
    id('postId'),
    postRules(true),
    validate,
    c.update,
  );
  router.delete('/author/posts/:postId', id('postId'), validate, c.remove);
  router.get(
    '/author/posts/:postId/comments',
    id('postId'),
    pagination,
    validate,
    c.comments(true),
  );
  router.delete(
    '/author/posts/:postId/comments/:commentId',
    id('postId'),
    id('commentId'),
    validate,
    c.moderate,
  );
  return router;
}
