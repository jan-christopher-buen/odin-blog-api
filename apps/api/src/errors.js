export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function errorHandler(error, req, res, _next) {
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Invalid JSON body' });
  if (error.type === 'entity.too.large')
    return res.status(413).json({ error: 'Request body too large' });
  if (error.code === 'P2025')
    return res.status(404).json({ error: 'Resource not found' });
  const status = error.status || 500;
  if (status >= 500 && process.env.NODE_ENV !== 'test')
    console.error('Request failed', { method: req.method, status });
  res.status(status).json({
    error: status >= 500 ? 'An unexpected error occurred' : error.message,
  });
}
