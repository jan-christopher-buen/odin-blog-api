const base = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api'
).replace(/\/$/, '');
export async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const error = new Error(data?.error || 'Request failed');
    error.status = res.status;
    error.fields = data?.fields;
    throw error;
  }
  return data;
}
