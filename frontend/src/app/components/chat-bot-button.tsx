import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Mic, MicOff } from "lucide-react";
import { buildApiUrl } from "../config/api";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

// Extend window for vendor-prefixed SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatBotButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice conversation state
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // ---- Stable refs so callbacks never use stale closures ----
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;
  const sendMessageRef = useRef<(text: string) => Promise<string | undefined>>(
    async () => undefined,
  );
  const startListeningRef = useRef<() => void>(() => {});

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(buildApiUrl("/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Request failed");
      }

      const data = await res.json();
      const reply: string =
        typeof data === "string"
          ? data
          : data.chatbot_response ?? data.reply ?? data.response ?? data.message ?? JSON.stringify(data);

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);

      // If voice mode is active, speak the reply via ElevenLabs
      if (voiceModeRef.current) {
        await speakText(reply);
      }

      return reply;
    } catch (e) {
      const errText = `Error: ${e instanceof Error ? e.message : "Could not reach the assistant."}`;
      setMessages((prev) => [...prev, { role: "assistant", text: errText }]);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  };

  // Keep sendMessageRef always current
  sendMessageRef.current = (text: string) => sendMessage(text);

  // ---- TTS via ElevenLabs (same voice/settings as the voice assistant) ----
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(async (text: string) => {
    stopAudio();
    setIsSpeaking(true);
    try {
      const res = await fetch(buildApiUrl("/voice/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS request failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        stopAudio();
        // Auto-listen again after AURA finishes speaking (use ref for latest state)
        if (voiceModeRef.current) startListeningRef.current();
      };
      audio.onerror = () => stopAudio();
      await audio.play();
    } catch {
      stopAudio();
    }
  }, [stopAudio]);

  // ---- STT via Web Speech API ----
  const listeningLockRef = useRef(false);   // prevent overlapping start() calls

  const startListening = useCallback(() => {
    const SRClass = getSpeechRecognition();
    if (!SRClass) return;
    // Guard against rapid re-entry
    if (listeningLockRef.current) return;
    listeningLockRef.current = true;

    // Tear down any previous instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    const recognition = new SRClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    setIsListening(true);

    let gotResult = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      gotResult = true;
      const last = event.results[event.results.length - 1];
      if (!last?.[0]) return;
      const transcript = last[0].transcript ?? "";
      if (transcript.trim()) {
        recognitionRef.current = null;
        setIsListening(false);
        listeningLockRef.current = false;
        sendMessageRef.current(transcript.trim());
      }
    };
    recognition.onerror = (e) => {
      const errName = (e as any).error ?? ""; // eslint-disable-line @typescript-eslint/no-explicit-any
      recognitionRef.current = null;
      setIsListening(false);
      listeningLockRef.current = false;
      // "no-speech" / "aborted" are harmless — restart after a pause
      if ((errName === "no-speech" || errName === "aborted") && voiceModeRef.current) {
        setTimeout(() => { if (voiceModeRef.current) startListeningRef.current(); }, 800);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      listeningLockRef.current = false;
      // If we didn't get a result and voice mode is still on, auto-restart
      if (!gotResult && voiceModeRef.current) {
        setTimeout(() => { if (voiceModeRef.current) startListeningRef.current(); }, 800);
      }
    };
    recognition.start();
  }, []);

  // Keep ref current
  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Toggle voice mode on/off
  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      // Turning off
      stopListening();
      stopAudio();
      setVoiceMode(false);
    } else {
      // Turning on
      setVoiceMode(true);
      startListeningRef.current();
    }
  }, [stopListening, stopAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopAudio();
    };
  }, [stopListening, stopAudio]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Button — bottom-left */}
      <div className="fixed bottom-6 left-6 z-50">
        <span
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] opacity-60 blur-xl animate-pulse"
          aria-hidden
        />
        <span
          className="absolute inset-0 rounded-2xl border-2 border-[#00d4ff]/50 animate-pulse"
          style={{ animationDuration: "1.5s" }}
          aria-hidden
        />
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] text-white p-4 rounded-2xl shadow-2xl shadow-[#00d4ff]/40 z-50 transition-all duration-300 hover:scale-105 hover:shadow-[#00d4ff]/60 active:scale-95"
          aria-label={isOpen ? "Close Chat" : "Open Chat"}
        >
          {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          <span className="absolute top-0 right-0 h-3 w-3 bg-[#10b981] rounded-full animate-pulse ring-2 ring-white/30" />
        </button>
      </div>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 left-6 w-[22rem] max-h-[30rem] bg-[#0a0f1e]/95 backdrop-blur-2xl rounded-2xl shadow-2xl z-50 border border-white/10 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[#00d4ff]" />
              <h3 className="text-base font-semibold text-white">AURA Chat</h3>
            </div>
            <div className="flex items-center gap-1">
              {/* Voice conversation toggle */}
              <button
                onClick={toggleVoiceMode}
                className={`p-1.5 rounded-lg transition-colors ${
                  voiceMode
                    ? "bg-[#00d4ff]/20 text-[#00d4ff]"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                }`}
                aria-label={voiceMode ? "Disable voice conversation" : "Enable voice conversation"}
                title={voiceMode ? "Voice mode ON" : "Talk to AURA"}
              >
                {voiceMode ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/5"
                aria-label="Close Chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[12rem] max-h-[20rem]">
            {messages.length === 0 && (
              <p className="text-xs text-white/40 text-center mt-8">
                Ask me anything about your assessment or results.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-white rounded-br-md"
                      : "bg-white/10 text-white/90 border border-white/10 rounded-bl-md"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#00d4ff]" />
                  <span className="text-xs text-white/60">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Voice mode status bar */}
          {voiceMode && (
            <div className="px-4 py-2 border-t border-white/5">
              <div className="flex items-center justify-center gap-2">
                {isListening && (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-xs text-red-300">Listening…</span>
                  </>
                )}
                {isSpeaking && (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00d4ff] opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00d4ff]" />
                    </span>
                    <span className="text-xs text-[#00d4ff]">AURA is speaking…</span>
                  </>
                )}
                {!isListening && !isSpeaking && !isLoading && (
                  <span className="text-xs text-white/50">Ready — speak now</span>
                )}
                {isLoading && (
                  <span className="text-xs text-white/50">Processing…</span>
                )}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                disabled={isLoading}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#00d4ff]/50 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] text-white p-2.5 rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
