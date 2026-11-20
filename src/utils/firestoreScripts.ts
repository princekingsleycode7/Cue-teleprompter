import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Script } from '../types/teleprompter';

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || `script-${Date.now()}`;
}

export async function ensureUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const displayName = (user.displayName || 'Speaker').slice(0, 120);
  const email = (user.email || '').slice(0, 200);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName,
        email,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToUserScripts(
  userId: string,
  onScripts: (scripts: Script[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const path = `users/${userId}/scripts`;
  const scriptsRef = collection(db, 'users', userId, 'scripts');
  const q = query(scriptsRef, where('ownerId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Script[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const updatedTs = data.updatedAt as Timestamp | undefined;
        return {
          id: docSnap.id,
          title: typeof data.title === 'string' ? data.title : 'Untitled Script',
          content: typeof data.content === 'string' ? data.content : '',
          format: data.format === 'plain' ? 'plain' : 'markdown',
          updatedAt: updatedTs?.toMillis ? updatedTs.toMillis() : Date.now(),
          cloudSynced: true,
        };
      });
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      onScripts(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertCloudScript(
  userId: string,
  script: Script
): Promise<void> {
  const safeId = sanitizeId(script.id);
  const path = `users/${userId}/scripts/${safeId}`;
  const ref = doc(db, 'users', userId, 'scripts', safeId);

  const safeTitle = (script.title || 'Untitled Script').slice(0, 200);
  const safeContent = (script.content || '').slice(0, 200000);
  const safeFormat = script.format === 'plain' ? 'plain' : 'markdown';

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: safeId,
        ownerId: userId,
        title: safeTitle,
        content: safeContent,
        format: safeFormat,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        title: safeTitle,
        content: safeContent,
        format: safeFormat,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudScript(
  userId: string,
  scriptId: string
): Promise<void> {
  const safeId = sanitizeId(scriptId);
  const path = `users/${userId}/scripts/${safeId}`;
  const ref = doc(db, 'users', userId, 'scripts', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function uploadLocalScriptsToCloud(
  userId: string,
  localScripts: Script[]
): Promise<void> {
  await Promise.all(
    localScripts.map((script) => upsertCloudScript(userId, script))
  );
}
