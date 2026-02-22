import React from "react";
import { Activity } from "lucide-react";
import { Card } from "../components/ui/card";
import { VoiceAssistantButton } from "../components/voice-assistant-button";

const ABOUT_TRANSCRIPT =
  "About AURA. Advanced Under-eye Response Assessment. AURA is a cognitive stability assessment tool that uses eye tracking and voice analysis to help monitor recovery and detect early signs of change. Results are summarized on your dashboard. This tool is for informational support only; always consult your physician about your health and recovery.";

export function AboutScreen() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0a0f1e] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />
      <div className="max-w-3xl mx-auto px-6 py-10 relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <Activity className="h-8 w-8 text-[#00d4ff]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">About AURA</h1>
            <p className="text-sm text-white/60">Advanced Under-eye Response Assessment</p>
          </div>
        </div>
        <Card className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl space-y-4">
          <p className="text-white/80 leading-relaxed">
            AURA is a cognitive stability assessment tool that uses eye tracking and voice
            analysis to help monitor recovery and detect early signs of change. It is designed
            for use before and after procedures to establish a baseline and track progress.
          </p>
          <p className="text-white/80 leading-relaxed">
            The assessment includes fixation stability, saccadic eye movement, smooth pursuit,
            and optional voice tests. Results are summarized on your dashboard and can be
            shared with your care team.
          </p>
          <p className="text-white/60 text-sm">
            This tool is for informational support only and does not replace professional
            medical advice. Always consult your physician about your health and recovery.
          </p>
        </Card>
      </div>
      <VoiceAssistantButton instructionType="about_us" transcript={ABOUT_TRANSCRIPT} />
    </div>
  );
}
