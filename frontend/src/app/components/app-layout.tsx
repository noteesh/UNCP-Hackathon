import React from "react";
import { Outlet, useLocation } from "react-router";
import { AppHeader } from "./app-header";
import { ChatBotButton } from "./chat-bot-button";

export function AppLayout() {
  const { pathname } = useLocation();
  const isSignIn = pathname === "/" || pathname === "";

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      {!isSignIn && <AppHeader />}
      <main className="flex-1">
        <Outlet />
      </main>
      <ChatBotButton />
    </div>
  );
}
