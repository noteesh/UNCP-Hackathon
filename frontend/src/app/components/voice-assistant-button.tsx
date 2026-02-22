import React, { useState, useRef } from "react";
import { Volume2, X, Play, Pause, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import { useAccessibility } from "../context/accessibility-context";

const DEFAULT_API_BASE = "http://localhost:8000";

interface VoiceAssistantButtonProps {
  transcript?: string;
  onPlay?: () => void;
  /** When set, Play will call this API to speak the transcript (e.g. landing page). */
  apiBaseUrl?: string;
  /** Landing page only: use GET /api/voice/instructions?type=... instead of POST generate. */
  instructionType?: string;
}

export function VoiceAssistantButton({ transcript, onPlay, apiBaseUrl, instructionType }: VoiceAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState([70]);
  const [slowMode, setSlowMode] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { voiceGuidance, setVoiceGuidance } = useAccessibility();

  const baseUrl = apiBaseUrl ?? DEFAULT_API_BASE;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsPlaying(false);
  };

  const hasPlaybackContent = (instructionType != null && instructionType !== "") || (transcript?.trim() ?? "") !== "";

  const handlePlayPause = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }
    if (!baseUrl || !hasPlaybackContent) {
      setIsPlaying(!isPlaying);
      onPlay?.();
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      let res: Response;
      if (instructionType) {
        res = await fetch(`${baseUrl}/api/voice/instructions?type=${encodeURIComponent(instructionType)}`);
      } else {
        res = await fetch(`${baseUrl}/api/voice/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: transcript!.trim() }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Failed to get audio");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.volume = volume[0] / 100;
      audio.onended = stopAudio;
      audio.onerror = () => {
        setError("Playback failed");
        stopAudio();
      };
      await audio.play();
      setIsPlaying(true);
      onPlay?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not play audio");
      stopAudio();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Voice Assistant Button with flashy pulse ring */}
      <div className="fixed bottom-6 right-6 z-50">
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
          aria-label="Open Voice Assistant"
        >
          <Volume2 className="h-6 w-6" />
          <span className="absolute top-0 right-0 h-3 w-3 bg-[#10b981] rounded-full animate-pulse ring-2 ring-white/30" />
        </button>
      </div>

      {/* Voice Assistant Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 bg-[#0a0f1e]/95 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 w-80 z-50 border border-white/10">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-[#00d4ff]" />
              <h3 className="text-base font-semibold text-white">Voice Assistant</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/5"
              aria-label="Close Voice Assistant"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Play/Pause – landing uses instructions?type=landing; others use generate with transcript */}
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handlePlayPause}
                disabled={isLoading || !hasPlaybackContent}
                className="flex-1 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white h-11 text-sm rounded-xl"
              >
                {isLoading ? (
                  <>Loading…</>
                ) : isPlaying ? (
                  <>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {hasPlaybackContent ? "Read page aloud" : "Play"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-11 px-4 border border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl"
                onClick={handlePlayPause}
                disabled={isLoading}
                aria-label="Repeat"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="space-y-2">
              <label className="block text-sm text-white/80">Volume</label>
              <Slider
                value={volume}
                onValueChange={setVolume}
                max={100}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-white/50 text-right">{volume[0]}%</p>
            </div>

            {/* Slow Speech Mode */}
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <label htmlFor="slow-mode" className="text-sm text-white">
                Slow Speech
              </label>
              <Switch
                id="slow-mode"
                checked={slowMode}
                onCheckedChange={setSlowMode}
              />
            </div>

            {/* Transcript Toggle */}
            {(transcript || instructionType) && (
              <>
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="w-full flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors border border-white/5"
                >
                  <span className="text-sm text-white">Transcript</span>
                  {showTranscript ? (
                    <ChevronUp className="h-4 w-4 text-white/50" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/50" />
                  )}
                </button>

                {showTranscript && (
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 max-h-32 overflow-y-auto">
                    <p className="text-xs text-white/70 leading-relaxed">{transcript || (instructionType ? "Use Read page aloud to hear this page." : "")}</p>
                  </div>
                )}
              </>
            )}

            {/* Voice Guidance — in assistant panel */}
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-[#00d4ff]" />
                <label htmlFor="voice-guidance-panel" className="text-sm text-white">
                  Voice Guidance
                </label>
              </div>
              <Switch
                id="voice-guidance-panel"
                checked={voiceGuidance}
                onCheckedChange={setVoiceGuidance}
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-white/40 text-center">
              Powered by ElevenLabs
            </p>
          </div>
        </div>
      )}
    </>
  );
}
