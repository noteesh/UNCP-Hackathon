import { useNavigate } from "react-router";
import { ArrowRight, Volume2, Play, Pause, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { motion } from "motion/react";

export function InstructionsScreen() {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);

  const transcript = `Step 1: Follow the Moving Dot. Please sit comfortably in your chair. Keep your head still and straight. You will see a dot moving across the screen. Follow the dot with your eyes only, not your head. The test will take about one minute. When you're ready, press Begin Test.`;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />

      <div className="max-w-4xl w-full space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-block px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full mb-3">
            <p className="text-sm text-[#00d4ff]">Step 1 of 2</p>
          </div>
          <h1 className="text-3xl font-bold text-white">Follow the Moving Dot</h1>
        </div>

        {/* Instruction Card */}
        <Card className="p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  1
                </div>
                <p className="text-sm text-white/80 pt-1">Please sit comfortably.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  2
                </div>
                <p className="text-sm text-white/80 pt-1">Keep your head still.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full flex items-center justify-center text-sm font-semibold text-white">
                  3
                </div>
                <p className="text-sm text-white/80 pt-1">Follow the moving dot with your eyes only.</p>
              </div>
            </div>

            {/* Animated Demo */}
            <div className="bg-[#0a0f1e] rounded-xl p-8 relative h-48 overflow-hidden border border-white/5">
              <div className="text-center mb-6">
                <p className="text-xs text-white/50">Demo: Watch the dot move</p>
              </div>
              <div className="relative h-24">
                <motion.div
                  className="absolute w-6 h-6 bg-gradient-to-br from-[#00d4ff] to-[#7c3aed] rounded-full shadow-lg shadow-[#00d4ff]/50"
                  animate={{
                    x: [0, 250, 250, 0, 0],
                    y: [0, 0, 80, 80, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  style={{
                    left: "calc(50% - 125px)",
                    top: "calc(50% - 12px)",
                  }}
                />
              </div>
            </div>

            {/* Voice Guidance Panel */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3 mb-3">
                <Volume2 className="h-5 w-5 text-[#00d4ff]" />
                <h3 className="text-sm font-semibold text-white">Voice Guidance</h3>
              </div>
              <div className="flex gap-2 mb-3">
                <Button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex-1 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white h-10 text-sm rounded-xl"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Play
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-4 border border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-xs text-white/60 leading-relaxed p-3 bg-[#0a0f1e] rounded-lg border border-white/5">
                {transcript}
              </div>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => navigate("/welcome")}
            variant="outline"
            className="h-12 px-6 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
          >
            Back
          </Button>
          <Button
            onClick={() => navigate("/eye-test")}
            className="flex-1 h-12 bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white text-sm font-semibold rounded-xl shadow-lg shadow-[#00d4ff]/20"
          >
            Begin Test
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Floating Voice Assistant Button */}
      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}
