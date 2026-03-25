/**
 * Firebase authentication provider for APIForge.
 * Wraps Firebase Auth SDK to provide ID tokens for API requests.
 * Firebase SDK is injected (not imported) to keep core dependency-free.
 *
 * Usage:
 *   import { initializeApp } from 'firebase/app';
 *   import { getAuth, signInWithCustomToken } from 'firebase/auth';
 *   import { FirebaseAuth } from '@apiforge/core';
 *
 *   const app = initializeApp({ apiKey, authDomain, projectId });
 *   const firebaseAuth = new FirebaseAuth({ auth: getAuth(app) });
 *   await firebaseAuth.signInWithCustomToken(token);
 *   const headers = await firebaseAuth.applyToHeaders({});
 *   // → { Authorization: 'Bearer <firebase-id-token>' }
 */
export class FirebaseAuth {
  #auth;
  #signInWithCustomToken;
  #signOutFn;
  #onAuthStateChangedFn;
  #user;
  #unsubscribe;
  #listeners;

  /**
   * @param {object} options
   * @param {object} options.auth - Firebase Auth instance from getAuth()
   * @param {Function} options.signInWithCustomToken - Firebase signInWithCustomToken function
   * @param {Function} options.signOut - Firebase signOut function
   * @param {Function} options.onAuthStateChanged - Firebase onAuthStateChanged function
   */
  constructor({ auth, signInWithCustomToken, signOut, onAuthStateChanged }) {
    this.#auth = auth;
    this.#signInWithCustomToken = signInWithCustomToken;
    this.#signOutFn = signOut;
    this.#onAuthStateChangedFn = onAuthStateChanged;
    this.#user = auth.currentUser || null;
    this.#listeners = new Set();
    this.#unsubscribe = null;

    if (this.#onAuthStateChangedFn) {
      this.#unsubscribe = this.#onAuthStateChangedFn(this.#auth, (user) => {
        this.#user = user;
        for (const listener of this.#listeners) {
          listener(user);
        }
      });
    }
  }

  /** Whether a user is currently signed in */
  get isSignedIn() {
    return this.#user !== null;
  }

  /** Current user's UID, or null */
  get uid() {
    return this.#user?.uid || null;
  }

  /** Current Firebase User object, or null */
  get currentUser() {
    return this.#user;
  }

  /**
   * Sign in with a custom token (from login popup/postMessage flow).
   * @param {string} customToken
   * @returns {Promise<object>} UserCredential
   */
  async signIn(customToken) {
    if (!this.#signInWithCustomToken) {
      throw new Error('signInWithCustomToken function not provided');
    }
    const credential = await this.#signInWithCustomToken(this.#auth, customToken);
    this.#user = credential.user;
    return credential;
  }

  /**
   * Sign out the current user.
   */
  async signOut() {
    if (!this.#signOutFn) {
      throw new Error('signOut function not provided');
    }
    await this.#signOutFn(this.#auth);
    this.#user = null;
  }

  /**
   * Get the current user's Firebase ID token.
   * @param {boolean} [forceRefresh=false] - Force token refresh
   * @returns {Promise<string|null>} ID token or null if not signed in
   */
  async getIdToken(forceRefresh = false) {
    if (!this.#user) return null;
    return this.#user.getIdToken(forceRefresh);
  }

  /**
   * Apply Firebase ID token to request headers as Bearer auth.
   * @param {object} [headers={}]
   * @returns {Promise<object>} headers with Authorization added
   */
  async applyToHeaders(headers = {}) {
    const token = await this.getIdToken();
    if (!token) return headers;
    return { ...headers, Authorization: `Bearer ${token}` };
  }

  /**
   * Get auth config compatible with BearerAuth.
   * @returns {Promise<{ type: string, token: string }|null>}
   */
  async toAuthConfig() {
    const token = await this.getIdToken();
    if (!token) return null;
    return { type: 'bearer', token };
  }

  /**
   * Register a listener for auth state changes.
   * @param {Function} callback - (user: object|null) => void
   * @returns {Function} unsubscribe function
   */
  onAuthStateChanged(callback) {
    this.#listeners.add(callback);
    return () => this.#listeners.delete(callback);
  }

  /**
   * Clean up listeners.
   */
  dispose() {
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
    this.#listeners.clear();
  }

  /**
   * Create from Firebase config (convenience factory).
   * Requires Firebase SDK functions to be passed in.
   * @param {object} config - { apiKey, authDomain, projectId }
   * @param {object} firebase - { initializeApp, getAuth, signInWithCustomToken, signOut, onAuthStateChanged }
   * @returns {FirebaseAuth}
   */
  static fromConfig(config, firebase) {
    const app = firebase.initializeApp(config);
    const auth = firebase.getAuth(app);
    return new FirebaseAuth({
      auth,
      signInWithCustomToken: firebase.signInWithCustomToken,
      signOut: firebase.signOut,
      onAuthStateChanged: firebase.onAuthStateChanged,
    });
  }
}
