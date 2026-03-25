import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequestBuilder } from '../src/http/request-builder.js';
import { BearerAuth } from '../src/http/auth/bearer-auth.js';
import { ApiKeyAuth } from '../src/http/auth/api-key-auth.js';
import { BasicAuth } from '../src/http/auth/basic-auth.js';

describe('RequestBuilder', () => {
  it('should build a simple GET request', () => {
    const req = new RequestBuilder()
      .setMethod('GET')
      .setUrl('https://api.example.com/users')
      .build();
    assert.equal(req.method, 'GET');
    assert.equal(req.url, 'https://api.example.com/users');
  });

  it('should add query params', () => {
    const req = new RequestBuilder()
      .setMethod('GET')
      .setUrl('https://api.example.com/users')
      .setQueryParams({ page: '1', limit: '10' })
      .build();
    assert.ok(req.url.includes('page=1'));
    assert.ok(req.url.includes('limit=10'));
  });

  it('should replace path params', () => {
    const req = new RequestBuilder()
      .setMethod('GET')
      .setUrl('https://api.example.com/users/{id}')
      .setPathParams({ id: '42' })
      .build();
    assert.equal(req.url, 'https://api.example.com/users/42');
  });

  it('should add bearer auth header', () => {
    const req = new RequestBuilder()
      .setMethod('GET')
      .setUrl('https://api.example.com/me')
      .setAuth({ type: 'bearer', token: 'my-jwt-token' })
      .build();
    assert.equal(req.headers['Authorization'], 'Bearer my-jwt-token');
  });

  it('should resolve variables', () => {
    const req = new RequestBuilder()
      .setMethod('GET')
      .setUrl('{{baseUrl}}/api/v1/users')
      .setHeader('Authorization', 'Bearer {{token}}')
      .resolveVariables({ baseUrl: 'http://localhost:3000', token: 'jwt123' })
      .build();
    assert.equal(req.url, 'http://localhost:3000/api/v1/users');
    assert.equal(req.headers['Authorization'], 'Bearer jwt123');
  });

  it('should set JSON body', () => {
    const req = new RequestBuilder()
      .setMethod('POST')
      .setUrl('https://api.example.com/users')
      .setBody({ name: 'John' })
      .build();
    assert.equal(req.headers['Content-Type'], 'application/json');
    assert.equal(req.body, JSON.stringify({ name: 'John' }));
  });
});

describe('BearerAuth', () => {
  it('should apply to headers', () => {
    const auth = new BearerAuth('my-token');
    const headers = auth.applyToHeaders({ 'Content-Type': 'application/json' });
    assert.equal(headers['Authorization'], 'Bearer my-token');
  });
});

describe('ApiKeyAuth', () => {
  it('should apply header auth', () => {
    const auth = new ApiKeyAuth('X-API-Key', 'secret123', 'header');
    const headers = auth.applyToHeaders();
    assert.equal(headers['X-API-Key'], 'secret123');
  });
});

describe('BasicAuth', () => {
  it('should apply to headers', () => {
    const auth = new BasicAuth('user', 'pass');
    const headers = auth.applyToHeaders();
    assert.ok(headers['Authorization'].startsWith('Basic '));
  });
});

// ─── FirebaseAuth ────────────────────────────────────────
import { FirebaseAuth } from '../src/http/auth/firebase-auth.js';

describe('FirebaseAuth', () => {
  function createMockAuth(currentUser = null) {
    return { currentUser };
  }

  function createMockUser(uid, token) {
    return {
      uid,
      getIdToken: async (forceRefresh) => token + (forceRefresh ? '-refreshed' : ''),
    };
  }

  it('should report not signed in when no user', () => {
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    assert.equal(auth.isSignedIn, false);
    assert.equal(auth.uid, null);
    assert.equal(auth.currentUser, null);
  });

  it('should report signed in when user exists', () => {
    const user = createMockUser('uid-123', 'test-token');
    const auth = new FirebaseAuth({
      auth: createMockAuth(user),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    assert.equal(auth.isSignedIn, true);
    assert.equal(auth.uid, 'uid-123');
  });

  it('should get ID token', async () => {
    const user = createMockUser('uid-123', 'my-jwt-token');
    const auth = new FirebaseAuth({
      auth: createMockAuth(user),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    const token = await auth.getIdToken();
    assert.equal(token, 'my-jwt-token');
  });

  it('should return null token when not signed in', async () => {
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    const token = await auth.getIdToken();
    assert.equal(token, null);
  });

  it('should apply token to headers', async () => {
    const user = createMockUser('uid-123', 'my-jwt-token');
    const auth = new FirebaseAuth({
      auth: createMockAuth(user),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    const headers = await auth.applyToHeaders({ 'Content-Type': 'application/json' });
    assert.equal(headers['Authorization'], 'Bearer my-jwt-token');
    assert.equal(headers['Content-Type'], 'application/json');
  });

  it('should not add auth header when not signed in', async () => {
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    const headers = await auth.applyToHeaders({ 'X-Custom': 'value' });
    assert.equal(headers['Authorization'], undefined);
    assert.equal(headers['X-Custom'], 'value');
  });

  it('should sign in with custom token', async () => {
    const user = createMockUser('uid-456', 'new-token');
    const mockSignIn = async (authInstance, token) => {
      assert.equal(token, 'custom-token-123');
      return { user };
    };
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: mockSignIn,
      signOut: null,
      onAuthStateChanged: null,
    });
    const credential = await auth.signIn('custom-token-123');
    assert.equal(credential.user.uid, 'uid-456');
    assert.equal(auth.isSignedIn, true);
  });

  it('should sign out', async () => {
    const user = createMockUser('uid-123', 'token');
    let signOutCalled = false;
    const mockSignOut = async () => { signOutCalled = true; };
    const auth = new FirebaseAuth({
      auth: createMockAuth(user),
      signInWithCustomToken: null,
      signOut: mockSignOut,
      onAuthStateChanged: null,
    });
    assert.equal(auth.isSignedIn, true);
    await auth.signOut();
    assert.equal(signOutCalled, true);
    assert.equal(auth.isSignedIn, false);
  });

  it('should notify listeners on auth state change', () => {
    let authCallback = null;
    const mockOnAuthStateChanged = (authInstance, cb) => {
      authCallback = cb;
      return () => { authCallback = null; };
    };
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: mockOnAuthStateChanged,
    });

    let receivedUser = 'not-called';
    auth.onAuthStateChanged((user) => { receivedUser = user; });

    const user = createMockUser('uid-789', 'token');
    authCallback(user);
    assert.equal(receivedUser.uid, 'uid-789');
    assert.equal(auth.isSignedIn, true);

    authCallback(null);
    assert.equal(receivedUser, null);
    assert.equal(auth.isSignedIn, false);
  });

  it('should generate auth config', async () => {
    const user = createMockUser('uid-123', 'jwt-token-xyz');
    const auth = new FirebaseAuth({
      auth: createMockAuth(user),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: null,
    });
    const config = await auth.toAuthConfig();
    assert.deepEqual(config, { type: 'bearer', token: 'jwt-token-xyz' });
  });

  it('should dispose listeners', () => {
    let unsubscribed = false;
    const mockOnAuthStateChanged = (authInstance, cb) => {
      return () => { unsubscribed = true; };
    };
    const auth = new FirebaseAuth({
      auth: createMockAuth(null),
      signInWithCustomToken: null,
      signOut: null,
      onAuthStateChanged: mockOnAuthStateChanged,
    });
    auth.dispose();
    assert.equal(unsubscribed, true);
  });

  it('should create from config via factory', () => {
    const mockFirebase = {
      initializeApp: (config) => ({ name: 'test-app', config }),
      getAuth: (app) => ({ currentUser: null, app }),
      signInWithCustomToken: async () => {},
      signOut: async () => {},
      onAuthStateChanged: () => () => {},
    };
    const auth = FirebaseAuth.fromConfig(
      { apiKey: 'key', authDomain: 'domain', projectId: 'proj' },
      mockFirebase
    );
    assert.equal(auth.isSignedIn, false);
    assert.ok(auth instanceof FirebaseAuth);
  });
});
