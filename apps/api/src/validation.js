import { body, param, query, validationResult } from 'express-validator';
export const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty())
    return res.status(422).json({
      error: 'Please check your input',
      fields: result.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  next();
};
export const id = (name) =>
  param(name).isUUID().withMessage('Use a valid resource ID');
export const pagination = [
  (req, res, next) => {
    if (Object.keys(req.query).some((key) => !['page', 'limit'].includes(key)))
      return res
        .status(422)
        .json({ error: 'Only page and limit query parameters are supported' });
    next();
  },
  query('page')
    .optional()
    .isString()
    .bail()
    .matches(/^[1-9]\d{0,4}$/)
    .withMessage('Page must be 1–99999'),
  query('limit')
    .optional()
    .isString()
    .bail()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be 1–50'),
];
export function fieldsOnly(allowed, partial = false) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
      return res.status(422).json({ error: 'A JSON object is required' });
    if (Object.keys(req.body).some((k) => !allowed.includes(k)))
      return res.status(422).json({ error: 'Unknown or protected field' });
    if (partial && Object.keys(req.body).length === 0)
      return res.status(422).json({ error: 'Provide a field to update' });
    next();
  };
}
const text = (name, max) =>
  body(name)
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max })
    .withMessage(`Must contain 1–${max} characters`);
export const commentRules = [text('displayName', 80), text('body', 2000)];
export const postRules = (partial = false) => [
  ...(partial
    ? [text('title', 200).optional(), text('body', 50000).optional()]
    : [text('title', 200), text('body', 50000)]),
  body('excerpt')
    .optional({ values: 'null' })
    .isString()
    .bail()
    .trim()
    .isLength({ max: 400 }),
  body('status').optional().isString().bail().isIn(['DRAFT', 'PUBLISHED']),
];
export const loginRules = [
  body('username')
    .isString()
    .bail()
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9_-]{3,40}$/),
  body('password')
    .isString()
    .bail()
    .custom(
      (value) => value.length > 0 && Buffer.byteLength(value, 'utf8') <= 72,
    )
    .withMessage('Password must be 1–72 UTF-8 bytes'),
];
