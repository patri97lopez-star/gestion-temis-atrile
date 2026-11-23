import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  ORG_ID,
  ROOT_ADMIN_EMAIL,
  testConnection,
} from '../lib/firebase';
import { emailToInviteId } from '../lib/formatters';
import {
  ROLE_PERMISSIONS,
  type UserInvite,
  type UserProfile,
  type UserRole,
} from '../types/erp';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  connectionOk: boolean;
  authError: string | null;
  permissions: (typeof ROLE_PERMISSIONS)[UserRole];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    testConnection().then((ok) => setConnectionOk(ok));
  }, []);

  const ensureUserProfile = useCallback(async (user: User): Promise<UserProfile | null> => {
    const userRef = doc(db, 'users', user.uid);
    const publicRef = doc(db, 'usersPublic', user.uid);

    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }

    if (snap.exists()) {
      const data = snap.data() as Omit<UserProfile, 'id'>;
      const loaded: UserProfile = { id: snap.id, ...data };
      // Ensure usersPublic exists for directory dropdowns
      try {
        const pubSnap = await getDoc(publicRef);
        if (!pubSnap.exists()) {
          await setDoc(publicRef, {
            uid: loaded.uid,
            displayName: loaded.displayName,
            role: loaded.role,
            department: loaded.department || 'General',
            active: loaded.active,
            orgId: ORG_ID,
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-blocking sync
      }
      return loaded;
    }

    const email = (user.email || '').trim().toLowerCase();
    const isRoot = email === ROOT_ADMIN_EMAIL.toLowerCase() && user.emailVerified;
    let resolvedRole: UserRole = isRoot ? 'Administrador' : 'Consulta';
    let resolvedName = user.displayName || email.split('@')[0] || 'Usuario';
    let resolvedDept = isRoot ? 'Dirección' : 'General';

    if (!isRoot && email) {
      try {
        const inviteRef = doc(db, 'userInvites', emailToInviteId(email));
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists()) {
          const inv = inviteSnap.data() as UserInvite;
          if (inv.active && inv.email.toLowerCase() === email) {
            resolvedRole = inv.role;
            if (inv.displayName) resolvedName = inv.displayName;
            if (inv.department) resolvedDept = inv.department;
          }
        }
      } catch {
        // No invite found or not readable; defaults to Consulta
      }
    }

    const newProfilePayload = {
      uid: user.uid,
      email: user.email || '',
      displayName: resolvedName.slice(0, 120),
      phone: '',
      department: resolvedDept.slice(0, 80),
      role: resolvedRole,
      active: true,
      orgId: ORG_ID,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newProfilePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
    }

    try {
      await setDoc(publicRef, {
        uid: user.uid,
        displayName: resolvedName.slice(0, 120),
        role: resolvedRole,
        department: resolvedDept.slice(0, 80),
        active: true,
        orgId: ORG_ID,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `usersPublic/${user.uid}`);
    }

    return {
      id: user.uid,
      uid: user.uid,
      email: user.email || '',
      displayName: resolvedName,
      phone: '',
      department: resolvedDept,
      role: resolvedRole,
      active: true,
      orgId: ORG_ID,
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) return;
    const loaded = await ensureUserProfile(firebaseUser);
    setProfile(loaded);
  }, [firebaseUser, ensureUserProfile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthError(null);
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      if (!user.emailVerified) {
        setAuthError('Tu cuenta de correo debe estar verificada para acceder.');
        setProfile(null);
        setAuthReady(true);
        return;
      }

      try {
        const loaded = await ensureUserProfile(user);
        setProfile(loaded);
      } catch (err) {
        setAuthError(
          err instanceof Error ? err.message : 'No se pudo cargar el perfil de usuario.'
        );
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [ensureUserProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo completar el inicio de sesión.';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  }, []);

  const getIdToken = useCallback(async (): Promise<string> => {
    if (!auth.currentUser) {
      throw new Error('Debes iniciar sesión para realizar esta operación.');
    }
    return auth.currentUser.getIdToken();
  }, []);

  const effectiveRole: UserRole = profile?.role || 'Consulta';
  const permissions = ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.Consulta;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        authReady,
        connectionOk,
        authError,
        permissions,
        signInWithGoogle,
        signOut,
        getIdToken,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return ctx;
}
