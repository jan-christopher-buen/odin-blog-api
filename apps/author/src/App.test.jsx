import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
const user = {
  id: 'author',
  displayName: 'Writer',
  username: 'writer',
  role: 'AUTHOR',
};
const post = {
  id: 'story',
  title: 'Working title',
  excerpt: '',
  body: 'A first thought',
  status: 'DRAFT',
  updatedAt: '2026-01-01T12:00:00Z',
};
const page = (items = []) => ({
  items,
  pagination: { page: 1, pages: 1, total: items.length },
});
const reply = (data, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => data });
function open(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
function network(handler) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url, opts) =>
      url.endsWith('/auth/me') ? reply({ user }) : handler(url, opts),
    ),
  );
}
describe('Author journeys', () => {
  it('logs in, stores the token, sends bearer headers, and clears private state on logout', async () => {
    network((url) =>
      url.endsWith('/auth/login')
        ? reply({ token: 'signed-token', user })
        : reply(page([post])),
    );
    open();
    await userEvent.type(screen.getByLabelText('Username'), 'writer');
    await userEvent.type(screen.getByLabelText('Password'), 'private password');
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(
      await screen.findByRole('heading', { name: post.title }),
    ).toBeVisible();
    expect(localStorage.getItem('margin.token')).toBe('signed-token');
    expect(
      fetch.mock.calls.find(([url]) => url.includes('/author/posts'))[1].headers
        .Authorization,
    ).toBe('Bearer signed-token');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByLabelText('Password');
    expect(localStorage.getItem('margin.token')).toBeNull();
    expect(screen.queryByText(post.title)).not.toBeInTheDocument();
  });
  it('reports login failures and clears password input', async () => {
    network(() => reply({ error: 'Invalid username or password' }, 401));
    open();
    await userEvent.type(screen.getByLabelText('Username'), 'writer');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
  it('creates a draft and loads the saved editor', async () => {
    localStorage.setItem('margin.token', 'token');
    network((url, options) =>
      options.method === 'POST'
        ? reply({ post }, 201)
        : reply(url.includes('/comments') ? page() : { post }),
    );
    open('/posts/new');
    await userEvent.type(
      await screen.findByLabelText('Title'),
      'Working title',
    );
    await userEvent.type(screen.getByLabelText('Story'), 'A first thought');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));
    expect(
      await screen.findByRole('heading', { name: 'Edit story' }),
    ).toBeVisible();
    const [, options] = fetch.mock.calls.find(([, o]) => o.method === 'POST');
    expect(JSON.parse(options.body).status).toBe('DRAFT');
  });
  it('saves edits and publication status, retaining fields on server validation errors', async () => {
    localStorage.setItem('margin.token', 'token');
    let invalid = true;
    network((url, options) =>
      options.method === 'PATCH'
        ? invalid
          ? reply(
              {
                error: 'Please check your input',
                fields: [{ field: 'title', message: 'Invalid title' }],
              },
              422,
            )
          : reply({ post: { ...post, status: 'PUBLISHED' } })
        : reply(url.includes('/comments') ? page() : { post }),
    );
    open('/posts/story');
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Changed title');
    await userEvent.selectOptions(
      screen.getByLabelText('Visibility'),
      'PUBLISHED',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid title');
    expect(title).toHaveValue('Changed title');
    invalid = false;
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved and published.')).toBeVisible();
    expect(
      JSON.parse(
        fetch.mock.calls.filter(([, o]) => o.method === 'PATCH').at(-1)[1].body,
      ),
    ).toMatchObject({ title: 'Changed title', status: 'PUBLISHED' });
  });
  it('keeps unsaved editor content across token expiry and reauthentication', async () => {
    localStorage.setItem('margin.token', 'old');
    let expired = true;
    network((url, options) =>
      url.endsWith('/auth/login')
        ? reply({ token: 'new', user })
        : options.method === 'PATCH'
          ? expired
            ? reply({ error: 'Authentication required' }, 401)
            : reply({ post })
          : reply(url.includes('/comments') ? page() : { post }),
    );
    open('/posts/story');
    await userEvent.type(await screen.findByLabelText('Story'), ' and more');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Your unsaved editor remains here',
    );
    expect(localStorage.getItem('margin.token')).toBeNull();
    await userEvent.type(screen.getByLabelText('Username'), 'writer');
    await userEvent.type(screen.getByLabelText('Password'), 'private');
    expired = false;
    await userEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Story')).toHaveValue(
      'A first thought and more',
    );
  });
  it('requires explicit deletion confirmation for stories and comments', async () => {
    localStorage.setItem('margin.token', 'token');
    const comment = {
      id: 'comment',
      displayName: 'Reader',
      body: 'Thought',
      createdAt: '2026-01-01T12:00:00Z',
    };
    network((url, options) =>
      options.method === 'DELETE'
        ? reply(null, 204)
        : url.includes('/comments')
          ? reply(page([comment]))
          : url.includes('/author/posts?')
            ? reply(page())
            : reply({ post }),
    );
    open('/posts/story');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete story' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('all its comments');
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(fetch.mock.calls.some(([, o]) => o.method === 'DELETE')).toBe(false);
    await userEvent.click(
      screen.getByRole('button', { name: /Delete comment/ }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete permanently' }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, o]) =>
            url.endsWith('/comments/comment') && o.method === 'DELETE',
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete story' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete permanently' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Stories' }),
    ).toBeVisible();
  });
  it('shows loading, connection errors and retry on the publishing list', async () => {
    localStorage.setItem('margin.token', 'token');
    let broken = true;
    network(() =>
      broken ? Promise.reject(new Error('Offline')) : reply(page()),
    );
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No stories on this page/)).toBeVisible();
  });
});
