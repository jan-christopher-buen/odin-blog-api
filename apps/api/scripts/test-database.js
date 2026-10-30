import pg from 'pg';
export async function verifyTestDatabase(url) {
  if (!url) throw new Error('TEST_DATABASE_URL is required');
  const parsed = new URL(url);
  if (
    parsed.pathname !== '/odin_blog_api_test' ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    (parsed.searchParams.has('host') &&
      parsed.searchParams.get('host') !== '/var/run/postgresql')
  )
    throw new Error(
      'Refusing test cleanup: use the dedicated local odin_blog_api_test database',
    );
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS name');
    if (result.rows[0].name !== 'odin_blog_api_test')
      throw new Error('Unexpected test database');
  } finally {
    await client.end();
  }
}
