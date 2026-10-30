import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';
import { verifyTestDatabase } from '../scripts/test-database.js';
import { configuration } from '../src/config.js';
import { createApp } from '../src/app.js';
await verifyTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
const { prisma: db } = await import('../src/prisma.js');
const config = configuration({
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: 'integration-only-random-material-32-bytes-long',
  FRONTEND_ORIGINS: 'http://localhost:5173,http://localhost:5174',
});
let api, author, other, reader, published, draft, token;
const password = 'test-only passphrase';
const sign = (id, options = {}) =>
  jwt.sign({}, config.secret, {
    algorithm: 'HS256',
    subject: id,
    issuer: config.issuer,
    audience: config.audience,
    expiresIn: '1h',
    ...options,
  });
const auth = () => ({ Authorization: `Bearer ${token}` });
async function cleanup() {
  await verifyTestDatabase(process.env.TEST_DATABASE_URL);
  await db.comment.deleteMany();
  await db.post.deleteMany();
  await db.user.deleteMany();
}
before(async () => {
  await db.$connect();
});
beforeEach(async () => {
  await cleanup();
  api = supertest(createApp(db, config));
  const passwordHash = await bcrypt.hash(password, 4);
  author = await db.user.create({
    data: {
      username: 'integration_author',
      displayName: 'Integration Author',
      passwordHash,
      role: 'AUTHOR',
    },
  });
  other = await db.user.create({
    data: {
      username: 'integration_other',
      displayName: 'Other Author',
      passwordHash,
      role: 'AUTHOR',
    },
  });
  reader = await db.user.create({
    data: {
      username: 'integration_reader',
      displayName: 'Reader',
      passwordHash,
      role: 'READER',
    },
  });
  published = await db.post.create({
    data: {
      authorId: author.id,
      title: 'Public story',
      body: 'First line\nSecond line',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
  draft = await db.post.create({
    data: { authorId: author.id, title: 'Private draft', body: 'Never public' },
  });
  token = sign(author.id);
});
after(async () => {
  await cleanup();
  await db.$disconnect();
});
describe('Public REST resources and privacy', () => {
  it('returns published summaries without hashes, bodies or draft counts', async () => {
    const res = await api.get('/api/posts').expect(200);
    assert.equal(res.body.pagination.total, 1);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].id, published.id);
    assert.equal(res.body.items[0].body, undefined);
    assert.equal(res.body.items[0].author.passwordHash, undefined);
    const detail = await api.get(`/api/posts/${published.id}`).expect(200);
    assert.equal(detail.body.post.body, published.body);
  });
  it('hides drafts on details, comments, submissions and pagination metadata', async () => {
    await db.comment.create({
      data: { postId: draft.id, displayName: 'Hidden', body: 'Hidden comment' },
    });
    for (const suffix of ['', '/comments'])
      await api.get(`/api/posts/${draft.id}${suffix}`).expect(404);
    await api
      .post(`/api/posts/${draft.id}/comments`)
      .send({ displayName: 'Reader', body: 'Hello' })
      .expect(404);
    const page = await api.get('/api/posts?page=2&limit=1').expect(200);
    assert.deepEqual(page.body.items, []);
    assert.equal(page.body.pagination.total, 1);
  });
  it('validates page bounds, IDs, object bodies and unknown mutation fields', async () => {
    for (const query of [
      'page=0',
      'page=1.2',
      'page=100000',
      'limit=0',
      'limit=51',
      'page[]=1',
    ])
      await api.get(`/api/posts?${query}`).expect(422);
    await api.get('/api/posts/nope').expect(422);
    for (const body of [
      { displayName: [], body: 'a' },
      { displayName: ' ', body: 'a' },
      { displayName: 'a', body: 'x'.repeat(2001) },
      { displayName: 'a', body: 'b', role: 'AUTHOR' },
      [],
    ])
      await api
        .post(`/api/posts/${published.id}/comments`)
        .send(body)
        .expect(422);
  });
  it('stores script-like and SQL-looking text literally and creates one comment', async () => {
    const body = '<script>alert(1)</script>\nDROP TABLE "User"; --';
    const res = await api
      .post(`/api/posts/${published.id}/comments`)
      .send({ displayName: '<b>Reader</b>', body })
      .expect(201);
    assert.equal(res.body.comment.body, body);
    assert.ok(res.headers.location);
    const comments = await api
      .get(`/api/posts/${published.id}/comments`)
      .expect(200);
    assert.equal(comments.body.pagination.total, 1);
    assert.equal(comments.body.items[0].body, body);
    assert.equal(await db.user.count(), 3);
  });
  it('limits public comments and login requests with JSON responses', async () => {
    const limited = supertest(createApp(db, config, { comment: 1, login: 1 }));
    const path = `/api/posts/${published.id}/comments`;
    await limited
      .post(path)
      .send({ displayName: 'Reader', body: 'Hello' })
      .expect(201);
    const res = await limited
      .post(path)
      .send({ displayName: 'Reader', body: 'Again' })
      .expect(429);
    assert.match(res.body.error, /Too many/);
    await limited
      .post('/api/auth/login')
      .send({ username: author.username, password: 'wrong' })
      .expect(401);
    await limited
      .post('/api/auth/login')
      .send({ username: author.username, password: 'wrong' })
      .expect(429);
  });
});
describe('JWT identity and authorization', () => {
  it('logs in with normalized username and uses signed bearer tokens', async () => {
    const res = await api
      .post('/api/auth/login')
      .send({ username: ' INTEGRATION_AUTHOR ', password })
      .expect(200);
    const payload = jwt.verify(res.body.token, config.secret, {
      algorithms: ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
    });
    assert.equal(payload.sub, author.id);
    assert.ok(payload.exp);
    assert.equal(payload.passwordHash, undefined);
    assert.equal(res.body.user.passwordHash, undefined);
    await api
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
  });
  it('uses generic login failures and never trims passwords', async () => {
    const first = await api
      .post('/api/auth/login')
      .send({ username: author.username, password: 'wrong' })
      .expect(401);
    const absent = await api
      .post('/api/auth/login')
      .send({ username: 'unknown', password })
      .expect(401);
    assert.equal(first.body.error, absent.body.error);
    await api
      .post('/api/auth/login')
      .send({ username: author.username, password: ` ${password}` })
      .expect(401);
    await api
      .post('/api/auth/login')
      .send({ username: author.username, password: '🔑'.repeat(19) })
      .expect(422);
  });
  it('rejects missing, malformed, expired, tampered, wrong issuer/audience/algorithm tokens', async () => {
    for (const value of [
      '',
      'Basic xyz',
      'Bearer malformed',
      `Bearer ${sign(author.id, { expiresIn: -1 })}`,
      `Bearer ${token.slice(0, -5)}wrong`,
      `Bearer ${sign(author.id, { issuer: 'wrong' })}`,
      `Bearer ${sign(author.id, { audience: 'wrong' })}`,
      `Bearer ${sign(author.id, { algorithm: 'HS384' })}`,
    ]) {
      const res = await api
        .get('/api/author/posts')
        .set('Authorization', value)
        .expect(401);
      assert.equal(res.body.error, 'Authentication required');
    }
  });
  it('protects every author operation from direct anonymous requests', async () => {
    for (const [method, path] of [
      ['get', '/api/auth/me'],
      ['get', '/api/author/posts'],
      ['post', '/api/author/posts'],
      ['get', `/api/author/posts/${draft.id}`],
      ['patch', `/api/author/posts/${draft.id}`],
      ['delete', `/api/author/posts/${draft.id}`],
      ['get', `/api/author/posts/${draft.id}/comments`],
      ['delete', `/api/author/posts/${draft.id}/comments/${published.id}`],
    ])
      await api[method](path).expect(401);
  });
  it('reads current roles from the database and scopes all operations to the owner', async () => {
    await api
      .get('/api/author/posts')
      .set('Authorization', `Bearer ${sign(reader.id)}`)
      .expect(403);
    const otherAuth = { Authorization: `Bearer ${sign(other.id)}` };
    assert.equal(
      (await api.get('/api/author/posts').set(otherAuth)).body.pagination.total,
      0,
    );
    for (const method of ['get', 'patch', 'delete']) {
      const r = api[method](`/api/author/posts/${draft.id}`).set(otherAuth);
      if (method === 'patch') r.send({ title: 'Forged' });
      await r.expect(404);
    }
    await api
      .get(`/api/author/posts/${draft.id}/comments`)
      .set(otherAuth)
      .expect(404);
    await db.user.update({
      where: { id: author.id },
      data: { role: 'READER' },
    });
    await api.get('/api/author/posts').set(auth()).expect(403);
  });
});
describe('Author publishing and moderation', () => {
  it('creates, edits, publishes, unpublishes and deletes posts and their comments', async () => {
    const created = await api
      .post('/api/author/posts')
      .set(auth())
      .send({ title: 'New', body: 'Body' })
      .expect(201);
    const id = created.body.post.id;
    assert.equal(created.body.post.status, 'DRAFT');
    assert.equal(created.body.post.author.id, author.id);
    await api.get(`/api/posts/${id}`).expect(404);
    const publishedRes = await api
      .patch(`/api/author/posts/${id}`)
      .set(auth())
      .send({ status: 'PUBLISHED', excerpt: 'Intro' })
      .expect(200);
    assert.ok(publishedRes.body.post.publishedAt);
    await api.get(`/api/posts/${id}`).expect(200);
    await api
      .patch(`/api/author/posts/${id}`)
      .set(auth())
      .send({ title: 'Renamed' })
      .expect(200);
    await api
      .post(`/api/posts/${id}/comments`)
      .send({ displayName: 'Public reader', body: 'A thought' })
      .expect(201);
    const unpublished = await api
      .patch(`/api/author/posts/${id}`)
      .set(auth())
      .send({ status: 'DRAFT' })
      .expect(200);
    assert.equal(unpublished.body.post.publishedAt, null);
    for (const suffix of ['', '/comments'])
      await api.get(`/api/posts/${id}${suffix}`).expect(404);
    await api
      .post(`/api/posts/${id}/comments`)
      .send({ displayName: 'Reader', body: 'No' })
      .expect(404);
    assert.equal((await api.get('/api/posts')).body.pagination.total, 1);
    await api.delete(`/api/author/posts/${id}`).set(auth()).expect(204);
    assert.equal(await db.comment.count({ where: { postId: id } }), 0);
  });
  it('rejects unknown, forged and invalid post mutations and empty PATCH', async () => {
    for (const body of [
      { title: 'Title', body: 'B', authorId: other.id },
      { title: 'Title', body: 'B', role: 'AUTHOR' },
      { title: 'Title', body: 'B', publishedAt: new Date().toISOString() },
      { title: 3, body: 'B' },
      { title: 'T', body: 'B', status: 'other' },
      { title: 'T', body: 'B', status: ['PUBLISHED'] },
      { title: 'T', body: 'x'.repeat(50001) },
    ])
      await api.post('/api/author/posts').set(auth()).send(body).expect(422);
    for (const body of [{}, { title: null }, { excerpt: 1 }])
      await api
        .patch(`/api/author/posts/${draft.id}`)
        .set(auth())
        .send(body)
        .expect(422);
  });
  it('checks nested comment/post relationships and ownership when moderating', async () => {
    const comment = await db.comment.create({
      data: { postId: published.id, displayName: 'Reader', body: 'Comment' },
    });
    await api
      .delete(`/api/author/posts/${draft.id}/comments/${comment.id}`)
      .set(auth())
      .expect(404);
    await api
      .delete(`/api/author/posts/${published.id}/comments/${comment.id}`)
      .set('Authorization', `Bearer ${sign(other.id)}`)
      .expect(404);
    assert.equal(
      (await api.get(`/api/author/posts/${published.id}/comments`).set(auth()))
        .body.pagination.total,
      1,
    );
    await api
      .delete(`/api/author/posts/${published.id}/comments/${comment.id}`)
      .set(auth())
      .expect(204);
    await api
      .delete(`/api/author/posts/${published.id}/comments/${comment.id}`)
      .set(auth())
      .expect(404);
  });
  it('uses JSON errors and exact CORS preflights including PATCH and DELETE', async () => {
    const preflight = await api
      .options(`/api/author/posts/${draft.id}`)
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    assert.equal(
      preflight.headers['access-control-allow-origin'],
      'http://localhost:5174',
    );
    assert.match(preflight.headers['access-control-allow-methods'], /DELETE/);
    const denied = await api
      .get('/api/posts')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    const absent = await api.get('/api/missing').expect(404);
    assert.match(absent.headers['content-type'], /json/);
    await api
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    const failing = supertest(
      createApp(
        {
          post: {
            findMany() {
              throw new Error('secret database message');
            },
          },
        },
        config,
      ),
    );
    const error = await failing.get('/api/posts').expect(500);
    assert.equal(error.body.error, 'An unexpected error occurred');
    assert.equal(error.body.stack, undefined);
  });
});
