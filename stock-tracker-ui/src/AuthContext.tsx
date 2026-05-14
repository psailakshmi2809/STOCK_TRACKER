import React, { createContext, useContext, useState } from 'react';

interface AuthUser {
  token: string;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (data: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token = localStorage.getItem('token');
    const name = localStorage.getItem('name');
    return token && name ? { token, name } : null;
  });

  const login = (data: AuthUser) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('name', data.name);
    setUser({ token: data.token, name: data.name });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('name');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
