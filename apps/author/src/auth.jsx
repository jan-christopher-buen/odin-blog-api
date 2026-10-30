import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { request } from './api.js';
const Context = createContext(null);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem('margin.token'),
  );
  const tokenRef = useRef(token);
  const [workspace, setWorkspace] = useState(false);
  const [user, setUser] = useState(null),
    [expired, setExpired] = useState(false),
    [checking, setChecking] = useState(!!token),
    [error, setError] = useState('');
  const expire = useCallback(() => {
    localStorage.removeItem('margin.token');
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setExpired(true);
  }, []);
  const api = useCallback(
    async (path, options = {}) => {
      const sentToken = tokenRef.current;
      try {
        return await request(path, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${sentToken || ''}`,
          },
        });
      } catch (err) {
        if (
          (err.status === 401 || err.status === 403) &&
          sentToken === tokenRef.current
        )
          expire();
        throw err;
      }
    },
    [expire],
  );
  useEffect(() => {
    if (!token || !checking) return;
    const controller = new AbortController();
    request('/auth/me', {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setWorkspace(data.user.id);
          setUser(data.user);
          setChecking(false);
          setError('');
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setChecking(false);
          if (err.status === 401 || err.status === 403) expire();
          else setError(err.message);
        }
      });
    return () => controller.abort();
  }, [token, checking, expire]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === 'margin.token' && !event.newValue) expire();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [expire]);
  async function login(username, password) {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem('margin.token', data.token);
    tokenRef.current = data.token;
    setToken(data.token);
    setWorkspace(data.user.id);
    setUser(data.user);
    setExpired(false);
    setError('');
  }
  function logout() {
    localStorage.removeItem('margin.token');
    tokenRef.current = null;
    setToken(null);
    setWorkspace(false);
    setUser(null);
    setExpired(false);
  }
  return (
    <Context
      value={{
        token,
        workspace,
        user,
        checking,
        expired,
        error,
        api,
        login,
        logout,
      }}
    >
      {children}
    </Context>
  );
}
