import { HttpError } from './errors.js';
const author = { select: { id: true, displayName: true, username: true } };
const summary = {
  id: true,
  title: true,
  excerpt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  author,
};
const pageArgs = (req) => {
  const page = Number(req.query.page || 1),
    limit = Number(req.query.limit || 10);
  return { page, limit, skip: (page - 1) * limit };
};
async function collection(db, model, where, req, orderBy, select) {
  const { page, limit, skip } = pageArgs(req);
  const [items, total] = await db.$transaction(
    [
      db[model].findMany({ where, orderBy, select, skip, take: limit }),
      db[model].count({ where }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}
export function controllers(db) {
  const scope = (req, privateRoute) => ({
    id: req.params.postId,
    ...(privateRoute ? { authorId: req.user.id } : { status: 'PUBLISHED' }),
  });
  const getPost = async (
    req,
    privateRoute,
    select = { ...summary, body: true },
  ) => {
    const post = await db.post.findFirst({
      where: scope(req, privateRoute),
      select,
    });
    if (!post) throw new HttpError(404, 'Post not found');
    return post;
  };
  return {
    list: (privateRoute) => async (req, res) =>
      res.json(
        await collection(
          db,
          'post',
          privateRoute ? { authorId: req.user.id } : { status: 'PUBLISHED' },
          req,
          privateRoute
            ? [{ updatedAt: 'desc' }, { id: 'desc' }]
            : [{ publishedAt: 'desc' }, { id: 'desc' }],
          summary,
        ),
      ),
    detail: (privateRoute) => async (req, res) =>
      res.json({ post: await getPost(req, privateRoute) }),
    comments: (privateRoute) => async (req, res) => {
      await getPost(req, privateRoute, { id: true });
      res.json(
        await collection(
          db,
          'comment',
          { postId: req.params.postId, post: scope(req, privateRoute) },
          req,
          [{ createdAt: 'desc' }, { id: 'desc' }],
        ),
      );
    },
    comment: async (req, res) => {
      // Hold a row lock through insertion: unpublish/delete cannot race this public write.
      const comment = await db.$transaction(async (tx) => {
        const rows =
          await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${req.params.postId}::uuid AND status = 'PUBLISHED' FOR SHARE`;
        if (!rows.length) throw new HttpError(404, 'Post not found');
        return tx.comment.create({
          data: {
            postId: req.params.postId,
            displayName: req.body.displayName,
            body: req.body.body,
          },
        });
      });
      res
        .status(201)
        .location(`/api/posts/${req.params.postId}/comments`)
        .json({ comment });
    },
    create: async (req, res) => {
      const { title, body, excerpt, status = 'DRAFT' } = req.body;
      const post = await db.post.create({
        data: {
          title,
          body,
          excerpt,
          status,
          authorId: req.user.id,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
        },
        select: { ...summary, body: true },
      });
      res.status(201).location(`/api/author/posts/${post.id}`).json({ post });
    },
    update: async (req, res) => {
      const current = await getPost(req, true, { id: true, status: true });
      const data = { ...req.body };
      if (data.status === 'DRAFT') data.publishedAt = null;
      if (data.status === 'PUBLISHED' && current.status !== 'PUBLISHED')
        data.publishedAt = new Date();
      const post = await db.post.update({
        where: { id: current.id, authorId: req.user.id },
        data,
        select: { ...summary, body: true },
      });
      res.json({ post });
    },
    remove: async (req, res) => {
      const result = await db.post.deleteMany({ where: scope(req, true) });
      if (!result.count) throw new HttpError(404, 'Post not found');
      res.status(204).end();
    },
    moderate: async (req, res) => {
      const result = await db.comment.deleteMany({
        where: {
          id: req.params.commentId,
          postId: req.params.postId,
          post: { authorId: req.user.id },
        },
      });
      if (!result.count) throw new HttpError(404, 'Comment not found');
      res.status(204).end();
    },
  };
}
