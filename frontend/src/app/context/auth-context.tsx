import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const AUTH_STORAGE_KEY = "aura-auth";

interface AuthContextType {
  isAuthenticated: boolean;
  userEmail: string | null;
  walletAddress: string | null;
  login: (email: string, password: string) => boolean;
  loginWithWallet: (address: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        setIsAuthenticated(true);
        setUserEmail(data.email ?? null);
        setWalletAddress(data.wallet ?? null);
      }
    } catch {
      // ignore
    }
  }, []);

  const login = (email: string, password: string) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return false;
    try {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ email: trimmedEmail, wallet: null })
      );
      setIsAuthenticated(true);
      setUserEmail(trimmedEmail);
      setWalletAddress(null);
      return true;
    } catch {
      return false;
    }
  };

  const loginWithWallet = (address: string) => {
    try {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ email: null, wallet: address })
      );
      setIsAuthenticated(true);
      setUserEmail(null);
      setWalletAddress(address);
    } catch {
      // ignore
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setUserEmail(null);
    setWalletAddress(null);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, userEmail, walletAddress, login, loginWithWallet, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
