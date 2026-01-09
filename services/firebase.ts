import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc
} from 'firebase/firestore';
import { GameHistoryEntry, Team } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

let auth = null;
let db = null;

if (hasFirebaseConfig) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export const firebaseEnabled = hasFirebaseConfig;

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export const signInWithGoogle = async () => {
  if (!auth) throw new Error('Firebase is not configured.');
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!auth) throw new Error('Firebase is not configured.');
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!auth) throw new Error('Firebase is not configured.');
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signOutUser = async () => {
  if (!auth) return;
  await signOut(auth);
};

export const fetchUserHistory = async (uid: string): Promise<GameHistoryEntry[]> => {
  if (!db) return [];
  const gamesRef = collection(db, 'users', uid, 'games');
  const historyQuery = query(gamesRef, orderBy('completedAt', 'desc'), limit(20));
  const snapshot = await getDocs(historyQuery);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as GameHistoryEntry;
    return {
      ...data,
      id: data.id || docSnap.id
    };
  });
};

export const saveHistoryEntry = async (uid: string, entry: GameHistoryEntry) => {
  if (!db) return;
  const entryRef = doc(db, 'users', uid, 'games', entry.id);
  await setDoc(entryRef, entry, { merge: true });
};

export const deleteHistoryEntry = async (uid: string, entryId: string) => {
  if (!db) return;
  const entryRef = doc(db, 'users', uid, 'games', entryId);
  await deleteDoc(entryRef);
};

type TeamsPayload = {
  teams: Team[];
  selectedTeamId?: string | null;
  updatedAt?: string;
};

const getTeamsDocRef = (uid: string) => (
  doc(db!, 'users', uid, 'rosters', 'main')
);

export const fetchUserTeams = async (uid: string): Promise<TeamsPayload | null> => {
  if (!db) return null;
  const snapshot = await getDoc(getTeamsDocRef(uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as TeamsPayload;
};

export const saveUserTeams = async (uid: string, payload: TeamsPayload) => {
  if (!db) return;
  await setDoc(getTeamsDocRef(uid), payload, { merge: true });
};
