import { useEffect, useRef, useState } from 'react';
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from './auth.jsx';
import s from './App.module.css';
const date = (v) =>
  new Date(v).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
function ErrorMessage({ error }) {
  return error ? (
    <div role="alert" className={s.error}>
      <p>{error.message || error}</p>
      {error.fields?.map((f) => (
        <p key={f.field}>
          {f.field}: {f.message}
        </p>
      ))}
    </div>
  ) : null;
}
export function Login({ expired = false }) {
  const { login } = useAuth();
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const lock = useRef(false);
  const dialog = useRef(null);
  useEffect(() => {
    if (expired) {
      const el = dialog.current;
      el.showModal();
      return () => el.close();
    }
  }, [expired]);
  const Container = expired ? 'dialog' : 'section';
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Container
      ref={expired ? dialog : undefined}
      className={expired ? s.overlay : s.login}
      aria-labelledby="login-title"
      aria-modal={expired || undefined}
      onCancel={expired ? (e) => e.preventDefault() : undefined}
    >
      <div className={s.loginPanel}>
        <p className={s.eyebrow}>Margin / Studio</p>
        <h1 id="login-title">
          {expired
            ? 'Sign in to continue.'
            : 'A space to shape your next story.'}
        </h1>
        <p>
          {expired
            ? 'Your session ended. Your unsaved editor remains here; sign in to save it.'
            : 'The publishing desk for Margin. Sign in with your author account.'}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            required
            maxLength={40}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorMessage error={error} />
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
        </form>
      </div>
    </Container>
  );
}
function usePrivate(path) {
  const { api } = useAuth();
  const [state, setState] = useState({ loading: true }),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, path });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error, path });
      });
    return () => controller.abort();
  }, [path, version, api]);
  return {
    ...(state.path === path ? state : { loading: true }),
    retry: () => {
      setState({ loading: true });
      setVersion((n) => n + 1);
    },
  };
}
function Feedback({ resource }) {
  return resource.loading ? (
    <p role="status">Loading…</p>
  ) : resource.error ? (
    <>
      <ErrorMessage error={resource.error} />
      <button onClick={resource.retry}>Try again</button>
    </>
  ) : null;
}
function Pages({ pagination: p, change }) {
  return (
    <nav aria-label="Pagination" className={s.pages}>
      <button disabled={p.page <= 1} onClick={() => change(p.page - 1)}>
        ← Previous
      </button>
      <span>
        Page {p.page} of {Math.max(1, p.pages)}
      </span>
      <button disabled={p.page >= p.pages} onClick={() => change(p.page + 1)}>
        Next →
      </button>
    </nav>
  );
}
function Dashboard() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('page') || '1';
  const page = /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : 1;
  const resource = usePrivate(`/author/posts?page=${page}&limit=10`);
  useEffect(() => {
    document.title = 'Stories — Margin Studio';
  }, []);
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <p className={s.eyebrow}>Your publishing desk</p>
          <h1>Stories</h1>
          <p>From first thought to published piece.</p>
        </div>
        <Link className={s.primary} to="/posts/new">
          + New story
        </Link>
      </div>
      <div className={s.listHead}>
        <span>Story / last updated</span>
        <span>Visibility</span>
      </div>
      <Feedback resource={resource} />
      {resource.data && (
        <>
          {resource.data.items.length ? (
            <ul className={s.postList}>
              {resource.data.items.map((post) => (
                <li key={post.id}>
                  <Link to={`/posts/${post.id}`}>
                    <div>
                      <h2>{post.title}</h2>
                      <time dateTime={post.updatedAt}>
                        {date(post.updatedAt)}
                      </time>
                    </div>
                    <span
                      className={
                        post.status === 'PUBLISHED' ? s.published : s.draft
                      }
                    >
                      {post.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.empty}>
              No stories on this page. Start with a new story.
            </p>
          )}
          <Pages
            pagination={resource.data.pagination}
            change={(n) => setParams({ page: n })}
          />
        </>
      )}
    </>
  );
}
function Confirm({ title, children, busy, onCancel, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="confirmation-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirmation-title">{title}</h2>
      <p>{children}</p>
      <div className={s.actions}>
        <button disabled={busy} onClick={onCancel}>
          Keep it
        </button>
        <button className={s.danger} disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
      </div>
    </dialog>
  );
}
function Moderation({ postId }) {
  const { api } = useAuth();
  const [page, setPage] = useState(1),
    [target, setTarget] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const resource = usePrivate(
    `/author/posts/${postId}/comments?page=${page}&limit=10`,
  );
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/author/posts/${postId}/comments/${target.id}`, {
        method: 'DELETE',
      });
      setTarget(null);
      resource.retry();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.moderation}>
      <h2>Conversation</h2>
      <p>Comments are public while the story is published.</p>
      <Feedback resource={resource} />
      <ErrorMessage error={error} />
      {resource.data && (
        <>
          {resource.data.items.length ? (
            resource.data.items.map((c) => (
              <article key={c.id} className={s.comment}>
                <div>
                  <strong>{c.displayName}</strong>
                  <time dateTime={c.createdAt}>{date(c.createdAt)}</time>
                  <p>{c.body}</p>
                </div>
                <button className={s.textDanger} onClick={() => setTarget(c)}>
                  Delete comment
                  <span className={s.sr}> by {c.displayName}</span>
                </button>
              </article>
            ))
          ) : (
            <p>No comments yet.</p>
          )}
          <Pages pagination={resource.data.pagination} change={setPage} />
        </>
      )}
      {target && (
        <Confirm
          title="Delete this comment?"
          busy={busy}
          onCancel={() => setTarget(null)}
          onConfirm={remove}
        >
          This removes the comment permanently.
        </Confirm>
      )}
    </section>
  );
}
const blank = { title: '', excerpt: '', body: '', status: 'DRAFT' };
export function Editor({ initial = blank, isNew = false }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(() => ({
    title: initial.title,
    excerpt: initial.excerpt || '',
    body: initial.body,
    status: initial.status,
  }));
  const [saved, setSaved] = useState(() => JSON.stringify(values)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [message, setMessage] = useState(''),
    [confirm, setConfirm] = useState(false);
  const lock = useRef(false),
    dirty = JSON.stringify(values) !== saved;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    document.title = `${isNew ? 'New story' : initial.title} — Margin Studio`;
  }, [isNew, initial.title]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const leave = (e) => {
      const link = e.target.closest?.('a[href]');
      if (
        link &&
        link.origin === window.location.origin &&
        link.pathname !== window.location.pathname &&
        !window.confirm('Leave without saving your changes?')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const data = await api(
        isNew ? '/author/posts' : `/author/posts/${initial.id}`,
        { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(values) },
      );
      if (!mounted.current) return;
      setSaved(JSON.stringify(values));
      setMessage(
        values.status === 'PUBLISHED'
          ? 'Saved and published.'
          : 'Draft saved. Only you can see it.',
      );
      if (isNew)
        navigate(`/posts/${data.post.id}`, {
          replace: true,
          state: { saved: true },
        });
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await api(`/author/posts/${initial.id}`, { method: 'DELETE' });
      if (mounted.current) navigate('/');
    } catch (err) {
      if (mounted.current) {
        setError(err);
        setConfirm(false);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function change(e) {
    setValues({ ...values, [e.target.name]: e.target.value });
    setMessage('');
  }
  return (
    <>
      <div className={s.editorHead}>
        <Link to="/">← Stories</Link>
        <span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
      </div>
      <form className={s.editor} onSubmit={save}>
        <div className={s.writing}>
          <p className={s.eyebrow}>
            {isNew ? 'A new beginning' : 'At the editing desk'}
          </p>
          <h1>{isNew ? 'New story' : 'Edit story'}</h1>
          <label htmlFor="title">Title</label>
          <input
            className={s.titleInput}
            id="title"
            name="title"
            required
            maxLength={200}
            value={values.title}
            onChange={change}
          />
          <label htmlFor="excerpt">
            Excerpt <span>(optional, 400 characters)</span>
          </label>
          <textarea
            id="excerpt"
            name="excerpt"
            rows={3}
            maxLength={400}
            value={values.excerpt}
            onChange={change}
          />
          <label htmlFor="body">Story</label>
          <textarea
            className={s.bodyInput}
            id="body"
            name="body"
            required
            rows={17}
            maxLength={50000}
            value={values.body}
            onChange={change}
          />
        </div>
        <aside className={s.inspector}>
          <h2>Publication</h2>
          <label htmlFor="status">Visibility</label>
          <select
            id="status"
            name="status"
            value={values.status}
            onChange={change}
          >
            <option value="DRAFT">Draft — private</option>
            <option value="PUBLISHED">Published — public</option>
          </select>
          <p>
            Choose a visibility and save to publish or unpublish your story.
          </p>
          <button className={s.save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create story' : 'Save changes'}
          </button>
          <p role="status" className={s.success}>
            {message ||
              (!isNew && !dirty ? 'Story loaded. Ready to edit.' : '')}
          </p>
          <ErrorMessage error={error} />
          {!isNew && (
            <>
              <hr />
              <p>
                Deleting a story also permanently removes all of its comments.
              </p>
              <button
                type="button"
                className={s.textDanger}
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Delete story
              </button>
            </>
          )}
        </aside>
      </form>
      {!isNew && <Moderation postId={initial.id} />}
      {confirm && (
        <Confirm
          title="Delete this story?"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={remove}
        >
          The story and all its comments will be permanently deleted.
        </Confirm>
      )}
    </>
  );
}
function Existing() {
  const { postId } = useParams();
  const resource = usePrivate(`/author/posts/${postId}`);
  return (
    <>
      <Feedback resource={resource} />
      {resource.data && <Editor key={postId} initial={resource.data.post} />}
    </>
  );
}
export default function App() {
  const auth = useAuth();
  const active = !!auth.workspace;
  return (
    <div className={s.shell}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <header className={s.header}>
        <Link to="/" className={s.logo}>
          margin<span>↗</span>
          <small>STUDIO</small>
        </Link>
        {active && (
          <div>
            <span>{auth.user?.displayName || 'Session ended'}</span>
            <button
              onClick={() => {
                if (window.confirm('Sign out? Save any changes first.'))
                  auth.logout();
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      <main id="main" inert={auth.expired && active ? true : undefined}>
        {auth.checking ? (
          <p role="status">Checking your session…</p>
        ) : auth.error ? (
          <>
            <ErrorMessage error={auth.error} />
            <button onClick={() => location.reload()}>Retry connection</button>
          </>
        ) : active ? (
          <Routes key={auth.workspace}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/posts/new" element={<Editor key="new" isNew />} />
            <Route path="/posts/:postId" element={<Existing />} />
            <Route
              path="*"
              element={
                <>
                  <h1>Page not found</h1>
                  <Link to="/">Stories</Link>
                </>
              }
            />
          </Routes>
        ) : (
          <Login />
        )}
      </main>
      {auth.expired && active && <Login expired />}
      <footer className={s.footer}>
        Margin Studio <span>Write with intention.</span>
      </footer>
    </div>
  );
}
