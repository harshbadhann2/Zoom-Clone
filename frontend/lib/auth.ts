// Keeps the login token in the browser. The server decides whether the token is valid.

const TOKEN_KEY = "zoom-clone-token";

// localStorage can throw (private mode, blocked storage), so every access is wrapped.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Not fatal: the user just has to sign in again next time.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
