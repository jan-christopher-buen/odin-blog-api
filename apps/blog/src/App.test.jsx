import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
const post = {
  id: 'story',
  title: 'A quiet beginning',
  excerpt: 'Make room.',
  body: 'First line\nSecond line\n<script>alert(1)</script>',
  publishedAt: '2026-01-01T12:00:00Z',
  author: { displayName: 'Writer' },
};
const page = (items) => ({
  items,
  pagination: { page: 1, pages: 1, total: items.length, limit: 10 },
});
const reply = (data, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => data });
function open(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe('Reader journeys', () => {
  it('shows loading, then published stories and readable publication information', async () => {
    let resolve;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    resolve(await reply(page([post])));
    expect(await screen.findByRole('link', { name: post.title })).toBeVisible();
    expect(screen.getByText(/Writer/)).toBeVisible();
  });
  it('retries failed fetches and supports the empty state', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection unavailable'))
      .mockImplementation(() => reply(page([])));
    vi.stubGlobal('fetch', fetch);
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connection unavailable',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No stories on this page/)).toBeVisible();
  });
  it('submits a public comment once, refetches and renders ordinary text safely', async () => {
    let comments = [];
    const text = '<script>alert(1)</script>';
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => {
        if (options.method === 'POST') {
          comments = [
            {
              id: 'comment',
              displayName: 'Reader',
              body: text,
              createdAt: '2026-01-02T12:00:00Z',
            },
          ];
          return reply({ comment: comments[0] }, 201);
        }
        return reply(url.includes('/comments') ? page(comments) : { post });
      }),
    );
    open('/posts/story');
    expect(
      await screen.findByRole('heading', { name: post.title }),
    ).toBeVisible();
    expect(screen.getByText(/First line/)).toHaveTextContent(
      '<script>alert(1)</script>',
    );
    expect(document.querySelector('main script')).toBeNull();
    await userEvent.type(screen.getByLabelText('Display name'), 'Reader');
    await userEvent.type(screen.getByLabelText('Comment'), text);
    await userEvent.click(screen.getByRole('button', { name: /Post comment/ }));
    expect(await screen.findByText(/Your comment was added/)).toBeVisible();
    await waitFor(() =>
      expect(screen.getAllByText(text, { exact: true })).toHaveLength(1),
    );
    expect(screen.getByLabelText('Comment')).toHaveValue('');
    expect(
      fetch.mock.calls.filter(([, o]) => o.method === 'POST'),
    ).toHaveLength(1);
  });
  it('preserves comment input on validation failure and explains unavailable stories', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) =>
        options.method === 'POST'
          ? reply(
              {
                error: 'Please check your input',
                fields: [{ field: 'body', message: 'Too long' }],
              },
              422,
            )
          : reply(url.includes('/comments') ? page([]) : { post }),
      ),
    );
    const view = open('/posts/story');
    await screen.findByLabelText('Comment');
    await userEvent.type(screen.getByLabelText('Display name'), 'Reader');
    await userEvent.type(screen.getByLabelText('Comment'), 'Keep this');
    await userEvent.click(screen.getByRole('button', { name: /Post comment/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too long');
    expect(screen.getByLabelText('Comment')).toHaveValue('Keep this');
    view.unmount();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => reply({ error: 'Post not found' }, 404)),
    );
    open('/posts/hidden');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This page is not available',
    );
  });
});
