import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Activity } from "lucide-react";
import { Button } from "../components/ui/button";
import { useAuth } from "../context/auth-context";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

export function AuthScreen() {
  const navigate = useNavigate();
  const { login, loginWithWallet, isAuthenticated } = useAuth();
  const { publicKey, connected, connecting, wallets, select, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [solanaError, setSolanaError] = useState("");

  useEffect(() => {
    if (isAuthenticated) navigate("/welcome");
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (connected && publicKey) {
      setSolanaError("");
      loginWithWallet(publicKey.toBase58());
      const t = setTimeout(() => navigate("/welcome"), 150);
      return () => clearTimeout(t);
    }
  }, [connected, publicKey, loginWithWallet, navigate]);

  const handleSignInWithSolana = async () => {
    setSolanaError("");
    const phantom = wallets.find(
      (w) =>
        w.adapter.name === "Phantom" ||
        String(w.adapter.name).toLowerCase().includes("phantom")
    );
    if (phantom) {
      try {
        select(phantom.adapter.name);
        await connect();
      } catch {
        setSolanaError("Connection failed. Try again or use the wallet list.");
        setVisible(true);
      }
    } else {
      setVisible(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const success = login(email, password);
    if (success) {
      navigate("/welcome");
    } else {
      setError("Please enter both email and password.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="absolute top-20 -right-20 w-96 h-96 bg-[#7c3aed]/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 -left-20 w-96 h-96 bg-[#00d4ff]/20 rounded-full blur-3xl" />

      <div className="w-full max-w-sm space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] p-[2px] mb-2">
            <div className="w-full h-full bg-[#0a0f1e] rounded-2xl flex items-center justify-center">
              <Activity className="w-8 h-8 text-[#00d4ff]" strokeWidth={1.5} />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] bg-clip-text text-transparent">
            AURA
          </h1>
          <p className="text-sm text-white/60">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white/90 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/90 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:border-[#00d4ff] focus:ring-2 focus:ring-[#00d4ff]/20 outline-none transition-all"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold rounded-xl"
          >
            Sign in
          </Button>

          <div className="relative flex items-center gap-3 my-4">
            <span className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/40">or</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>

          {solanaError && (
            <p className="text-sm text-red-400">{solanaError}</p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 border border-white/20 bg-white/5 text-white hover:bg-white/10 font-semibold rounded-xl"
            disabled={connecting}
            onClick={handleSignInWithSolana}
          >
            {connecting ? "Connecting…" : "Sign in with Solana"}
          </Button>
        </form>
      </div>
    </div>
  );
}
