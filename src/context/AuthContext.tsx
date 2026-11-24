import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, ORG_ID, testConnection } from '../lib/firebase';
import { ROLE_PERMISSIONS, type UserProfile, type UserRole } from '../types/erp';

export const DEFAULT_OPERATOR_UID = 'temis-atrile-principal';

const DEFAULT_PROFILE: UserProfile = {
  id: DEFAULT_OPERATOR_UID,
  uid: DEFAULT_OPERATOR_UID,
  email: 'administracion@temisatrile.es',
  displayName: 'Dirección · Temis Atrile',
  phone: '',
  department: 'Administración',
  role: 'Administrador',
  active: true,
  orgId: ORG_ID,
};

interface AuthContextValue {
  operatorUid: string;
  profile: UserProfile | null;
  authReady: boolean;
  connectionOk: boolean;
  permissions: (typeof ROLE_PERMISSIONS)[UserRole];
  getIdToken: () => Promise<string>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(DEFAULT_PROFILE);
  const [authReady] = useState(true);
  const [connectionOk, setConnectionOk] = useState(true);
  const sessionTokenRef = useRef<{ token: string; expiresAtMs: number } | null>(null);

  const syncWorkspaceProfile = useCallback(async (): Promise<UserProfile> => {
    const userRef = doc(db, 'users', DEFAULT_OPERATOR_UID);
    const publicRef = doc(db, 'usersPublic', DEFAULT_OPERATOR_UID);

    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as Omit<UserProfile, 'id'>;
        const loaded: UserProfile = { id: snap.id, ...data, active: true };
        const pubSnap = await getDoc(publicRef);
        if (!pubSnap.exists()) {
          await setDoc(publicRef, {
            uid: loaded.uid,
            displayName: loaded.displayName,
            role: loaded.role,
            department: loaded.department || 'Administración',
            active: true,
            orgId: ORG_ID,
            updatedAt: serverTimestamp(),
          });
        }
        return loaded;
      }

      await setDoc(userRef, {
        uid: DEFAULT_PROFILE.uid,
        email: DEFAULT_PROFILE.email,
        displayName: DEFAULT_PROFILE.displayName,
        phone: '',
        department: DEFAULT_PROFILE.department,
        role: DEFAULT_PROFILE.role,
        active: true,
        orgId: ORG_ID,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(publicRef, {
        uid: DEFAULT_PROFILE.uid,
        displayName: DEFAULT_PROFILE.displayName,
        role: DEFAULT_PROFILE.role,
        department: DEFAULT_PROFILE.department,
        active: true,
        orgId: ORG_ID,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Keep active local default workspace profile even if initial profile sync fails
    }

    return DEFAULT_PROFILE;
  }, []);

  useEffect(() => {
    testConnection().then((ok) => {
      setConnectionOk(ok);
      if (ok) {
        syncWorkspaceProfile().then((loaded) => setProfile(loaded));
      }
    });
  }, [syncWorkspaceProfile]);

  const refreshProfile = useCallback(async () => {
    const loaded = await syncWorkspaceProfile();
    setProfile(loaded);
  }, [syncWorkspaceProfile]);

  const getIdToken = useCallback(async (): Promise<string> => {
    const current = sessionTokenRef.current;
    if (current && Date.now() < current.expiresAtMs - 60_000) {
      return current.token;
    }
    const resp = await fetch('/api/session', { method: 'POST' });
    if (!resp.ok) {
      throw new Error('No se pudo inicializar la sesión de asistencia con el servidor.');
    }
    const payload = (await resp.json()) as { token?: string; expiresInSec?: number };
    if (!payload.token) {
      throw new Error('El servidor no devolvió un token de sesión válido.');
    }
    const ttlMs = (payload.expiresInSec || 3600) * 1000;
    sessionTokenRef.current = {
      token: payload.token,
      expiresAtMs: Date.now() + ttlMs,
    };
    return payload.token;
  }, []);

  const effectiveRole: UserRole = profile?.role || 'Administrador';
  const permissions = ROLE_PERMISSIONS[effectiveRole] || ROLE_PERMISSIONS.Administrador;

  return (
    <AuthContext.Provider
      value={{
        operatorUid: DEFAULT_OPERATOR_UID,
        profile,
        authReady,
        connectionOk,
        permissions,
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
