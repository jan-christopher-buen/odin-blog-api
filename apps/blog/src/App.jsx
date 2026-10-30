import { useEffect, useRef, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { request } from './api.js';
import s from './App.module.css';
const date = (value) =>
  new Date(value).toLocaleDateString('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
export function useResource(path, revision = 0) {
  const [state, setState] = useState({ loading: true });
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, loading: false, path });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ error, loading: false, path });
      });
    return () => controller.abort();
  }, [path, attempt, revision]);
  return {
    ...(state.path === path ? state : { loading: true }),
    retry: () => {
      setState({ loading: true });
      retry((v) => v + 1);
    },
  };
}
export function Feedback({ resource }) {
  if (resource.loading)
    return (
      <p role="status" className={s.notice}>
        Loading…
      </p>
    );
  if (resource.error)
    return (
      <div role="alert" className={s.notice}>
        <p>
          {resource.error.status === 404
            ? 'This page is not available.'
            : resource.error.message}
        </p>
        <button onClick={resource.retry}>Try again</button>{' '}
        <Link to="/">Back to stories</Link>
      </div>
    );
}
export function Pagination({ value, onPage }) {
  return (
    <nav className={s.pagination} aria-label="Pagination">
      <button disabled={value.page <= 1} onClick={() => onPage(value.page - 1)}>
        ← Previous
      </button>
      <span>
        Page {value.page} of {Math.max(1, value.pages)}
      </span>
      <button
        disabled={value.page >= value.pages}
        onClick={() => onPage(value.page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
function Index() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('page') || '1';
  const page = /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : 1;
  const resource = useResource(`/posts?page=${page}&limit=6`);
  useEffect(() => {
    document.title = 'Margin — Notes worth keeping';
  }, []);
  return (
    <>
      <section className={s.intro}>
        <p className={s.eyebrow}>An independent notebook</p>
        <h1>
          Notes worth
          <br />
          <em>keeping.</em>
        </h1>
        <p>Thoughts, observations, and room for a conversation.</p>
      </section>
      <section aria-label="Published stories">
        <div className={s.sectionHead}>
          <h2>The latest</h2>
          <span>Essays & field notes</span>
        </div>
        <Feedback resource={resource} />
        {resource.data && (
          <>
            {resource.data.items.length ? (
              resource.data.items.map((post, i) => (
                <article className={s.story} key={post.id}>
                  <span className={s.number}>
                    {String((page - 1) * 6 + i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className={s.meta}>
                      <time dateTime={post.publishedAt}>
                        {date(post.publishedAt)}
                      </time>{' '}
                      · {post.author.displayName}
                    </p>
                    <h2>
                      <Link to={`/posts/${post.id}`}>{post.title}</Link>
                    </h2>
                    {post.excerpt && <p>{post.excerpt}</p>}
                    <Link className={s.read} to={`/posts/${post.id}`}>
                      Read story <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <p className={s.notice}>
                No stories on this page yet.{' '}
                <Link to="/">Return to the first page</Link>
              </p>
            )}
            <Pagination
              value={resource.data.pagination}
              onPage={(n) => setParams({ page: n })}
            />
          </>
        )}
      </section>
    </>
  );
}
export function Comments({ postId }) {
  const [page, setPage] = useState(1),
    [version, setVersion] = useState(0);
  const resource = useResource(
    `/posts/${postId}/comments?page=${page}&limit=10`,
    version,
  );
  const [name, setName] = useState(''),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(null);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      await request(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ displayName: name, body }),
      });
      if (alive.current) {
        setBody('');
        setMessage('Your comment was added. Thank you for joining in.');
        setPage(1);
        setVersion((v) => v + 1);
      }
    } catch (err) {
      if (alive.current) setError(err);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className={s.comments} aria-labelledby="conversation">
      <div className={s.sectionHead}>
        <h2 id="conversation">In the margins</h2>
        <span>The conversation</span>
      </div>
      <Feedback resource={resource} />
      {resource.data && (
        <>
          {resource.data.items.length ? (
            <ol className={s.commentList}>
              {resource.data.items.map((c) => (
                <li key={c.id}>
                  <p className={s.meta}>
                    <strong>{c.displayName}</strong> ·{' '}
                    <time dateTime={c.createdAt}>{date(c.createdAt)}</time>
                  </p>
                  <p className={s.plain}>{c.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>Be the first to leave a thought.</p>
          )}
          <Pagination value={resource.data.pagination} onPage={setPage} />
        </>
      )}
      <form onSubmit={submit} className={s.form}>
        <h3>Leave a thought</h3>
        <p>No account needed. Comments are public.</p>
        <label htmlFor="name">Display name</label>
        <input
          id="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="comment">Comment</label>
        <textarea
          id="comment"
          required
          maxLength={2000}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && (
          <div role="alert">
            <p>{error.message}</p>
            {error.fields?.map((f) => (
              <p key={f.field}>
                {f.field}: {f.message}
              </p>
            ))}
          </div>
        )}
        <p role="status">{message}</p>
        <button disabled={busy}>{busy ? 'Sending…' : 'Post comment ↗'}</button>
      </form>
    </section>
  );
}
function Article() {
  const { postId } = useParams();
  const resource = useResource(`/posts/${postId}`);
  useEffect(() => {
    document.title = resource.data
      ? `${resource.data.post.title} — Margin`
      : 'Story — Margin';
  }, [resource.data]);
  return (
    <>
      <Link className={s.back} to="/">
        ← All stories
      </Link>
      <Feedback resource={resource} />
      {resource.data && (
        <>
          <article className={s.article}>
            <p className={s.eyebrow}>From the notebook</p>
            <h1>{resource.data.post.title}</h1>
            <p className={s.meta}>
              By {resource.data.post.author.displayName} ·{' '}
              <time dateTime={resource.data.post.publishedAt}>
                {date(resource.data.post.publishedAt)}
              </time>
            </p>
            {resource.data.post.excerpt && (
              <p className={s.dek}>{resource.data.post.excerpt}</p>
            )}
            <div className={s.body}>{resource.data.post.body}</div>
          </article>
          <Comments key={postId} postId={postId} />
        </>
      )}
    </>
  );
}
export default function App() {
  return (
    <div className={s.shell}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <header className={s.header}>
        <Link className={s.logo} to="/">
          margin<span>↗</span>
        </Link>
        <span className={s.wordmark}>A little room for thought.</span>
        <Link to="/">Stories</Link>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/posts/:postId" element={<Article />} />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/">All stories</Link>
              </>
            }
          />
        </Routes>
      </main>
      <footer className={s.footer}>
        <Link to="/">margin ↗</Link>
        <p>Read slowly. Leave a thought.</p>
      </footer>
    </div>
  );
}
