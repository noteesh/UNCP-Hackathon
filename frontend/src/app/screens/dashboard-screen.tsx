import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  LayoutDashboard,
  AlertTriangle,
  BookOpen,
  FlaskConical,
  Calendar,
  User,
  ChevronRight,
  FileText,
  Play,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { ScrollArea } from "../components/ui/scroll-area";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { motion } from "motion/react";

/** Parsed single explanation line: metric:value:threshold:description */
function parseExplanationLine(line: string) {
  const parts = line.split(":");
  if (parts.length < 4) return { metric: line, value: "", threshold: "", description: line };
  const metric = parts[0].replace(/_/g, " ");
  const value = parts[1];
  const threshold = parts[2];
  const description = parts.slice(3).join(":").trim();
  return { metric, value, threshold, description };
}

const MOCK_DASHBOARD = {
  risk_level: "high" as const,
  conditions_flagged: ["post_op_delirium"],
  confidence_score: 0.85,
  explanation: [
    "saccade_velocity:204.6:148:Saccadic peak velocity decreased significantly, indicating potential spatial attention and motor control issues.",
    "fixation_stability:0.832:0.58:Reduced fixation stability suggests compromised attention control.",
    "pupil_variability:0.038:0.13:Increased pupil variability may reflect stress or altered autonomic function.",
    "antisaccade_latency:304.6:430:Increased antisaccade latency is indicative of impaired executive function.",
    "smooth_pursuit_gain:0.86:0.6:Decreased smooth pursuit gain suggests potential deterioration in attention.",
    "saccade_accuracy:0.908:0.71:Reduced accuracy could denote cognitive decline.",
    "prosaccade_latency:197.8:290:Longer prosaccade latency points to potential neurological deficits.",
  ],
  research_references_used: [
    "Saccade Tasks: A Noninvasive Approach for Predicting Postoperative Delirium in Elderly Arthroplasty Patients — Kang et al.",
    "A Dual-Camera Eye-Tracking Platform for Rapid Real-Time Diagnosis of Acute Delirium: A Pilot Study — Al-Hindawi et al.",
  ],
  // Extra dashboard fields
  total_tests_done: 12,
  last_assessment_at: "2025-02-21T14:30:00Z",
  baseline_assessment_at: "2025-02-18T09:00:00Z",
  patient_name: "Patient", // overridden by URL ?name=
};

function getRiskStyle(level: string) {
  switch (level) {
    case "high":
      return { bg: "#ef4444", bgLight: "#ef444415", border: "#ef444440", label: "High risk" };
    case "medium":
      return { bg: "#f59e0b", bgLight: "#f59e0b15", border: "#f59e0b40", label: "Medium risk" };
    case "low":
      return { bg: "#10b981", bgLight: "#10b98115", border: "#10b98140", label: "Low risk" };
    default:
      return { bg: "#6b7280", bgLight: "#6b728015", border: "#6b728040", label: level };
  }
}

export function DashboardScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nameFromUrl = searchParams.get("name");
  const data = {
    ...MOCK_DASHBOARD,
    patient_name: nameFromUrl?.trim() || MOCK_DASHBOARD.patient_name,
  };
  const riskStyle = getRiskStyle(data.risk_level);

  const dashboardTranscript = [
    `Assessment dashboard for ${data.patient_name}.`,
    `Risk level is ${riskStyle.label.toLowerCase()}.`,
    data.conditions_flagged.length
      ? `Conditions flagged: ${data.conditions_flagged.map((c) => c.replace(/_/g, " ")).join(", ")}.`
      : "",
    `Confidence score is ${(data.confidence_score * 100).toFixed(0)} percent.`,
    `${data.total_tests_done} tests completed. Last assessment ${new Date(data.last_assessment_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-[#0a0f1e] p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />

      <div className="max-w-4xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
              <LayoutDashboard className="h-6 w-6 text-[#00d4ff]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Assessment Dashboard</h1>
              <p className="text-sm text-white/60">Risk overview and biomarker breakdown</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigate("/instructions")}
              className="bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Start assessment
            </Button>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={() => navigate("/")}
            >
              Back to app
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <User className="h-4 w-4" />
                <span className="text-xs font-medium">Patient name</span>
              </div>
              <p className="text-lg font-semibold text-white truncate" title={data.patient_name}>
                {data.patient_name}
              </p>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <FlaskConical className="h-4 w-4" />
                <span className="text-xs font-medium">Tests completed</span>
              </div>
              <p className="text-lg font-semibold text-white">{data.total_tests_done}</p>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">Last assessment</span>
              </div>
              <p className="text-sm font-semibold text-white">
                {new Date(data.last_assessment_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
              <div className="flex items-center gap-2 text-white/60 mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium">Baseline</span>
              </div>
              <p className="text-sm font-semibold text-white">
                {new Date(data.baseline_assessment_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </Card>
          </motion.div>
        </div>

        {/* Risk level + conditions + confidence */}
        <div className="grid md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl h-full">
              <div className="flex items-center gap-2 text-white/60 mb-3">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Risk level</span>
              </div>
              <div
                className="inline-flex items-center px-4 py-2 rounded-xl border"
                style={{
                  backgroundColor: riskStyle.bgLight,
                  borderColor: riskStyle.border,
                }}
              >
                <span className="font-semibold capitalize" style={{ color: riskStyle.bg }}>
                  {riskStyle.label}
                </span>
              </div>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl h-full">
              <div className="flex items-center gap-2 text-white/60 mb-3">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">Conditions flagged</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.conditions_flagged.map((c) => (
                  <Badge
                    key={c}
                    variant="destructive"
                    className="bg-red-500/20 text-red-300 border-red-500/30"
                  >
                    {c.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </Card>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl h-full">
              <div className="flex items-center gap-2 text-white/60 mb-3">
                <span className="text-sm font-medium">Confidence score</span>
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-white">
                  {(data.confidence_score * 100).toFixed(0)}%
                </p>
                <Progress
                  value={data.confidence_score * 100}
                  className="h-2 bg-white/10"
                />
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Biomarker explanations */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-[#00d4ff]" />
              Biomarker breakdown
            </h2>
            <ScrollArea className="h-[280px] pr-4">
              <ul className="space-y-3">
                {data.explanation.map((line, i) => {
                  const { metric, value, threshold, description } = parseExplanationLine(line);
                  return (
                    <li key={i}>
                      <Card className="p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[#00d4ff] capitalize">
                              {metric}
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">
                              Value: {value} · Threshold: {threshold}
                            </p>
                            <p className="text-sm text-white/80 mt-1">{description}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </Card>
        </motion.div>

        {/* Research references */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#00d4ff]" />
              Research references used
            </h2>
            <ul className="space-y-2">
              {data.research_references_used.map((ref, i) => (
                <li
                  key={i}
                  className="text-sm text-white/80 pl-4 border-l-2 border-white/20 py-1"
                >
                  {ref}
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>
      </div>

      <VoiceAssistantButton transcript={dashboardTranscript} />
    </div>
  );
}
