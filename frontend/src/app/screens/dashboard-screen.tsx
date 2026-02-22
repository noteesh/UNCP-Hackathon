import React, { useEffect, useMemo, useState } from "react";
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
  LogOut,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { ScrollArea } from "../components/ui/scroll-area";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import { useAuth } from "../context/auth-context";
import { motion } from "motion/react";
import { buildApiUrl } from "../config/api";
import { loadLatestGeminiSummary } from "../lib/gemini-analysis";

/** Parsed single explanation line: metric:baseline:latest:description */
function parseExplanationLine(line: string) {
  const parts = line.split(":");
  if (parts.length < 4) return { metric: line, baseline: "", latest: "", description: line, delta: null, trend: "stable" as const };
  const metric = parts[0].replace(/_/g, " ");
  const baseline = parts[1].trim();
  const latest = parts[2].trim();
  const description = parts.slice(3).join(":").trim();

  // Compute delta for indicator
  const baseNum = parseFloat(baseline);
  const latestNum = parseFloat(latest);
  let delta: number | null = null;
  let trend: "up" | "down" | "stable" = "stable";
  if (!isNaN(baseNum) && !isNaN(latestNum)) {
    delta = latestNum - baseNum;
    if (Math.abs(delta) < 0.0001) trend = "stable";
    else trend = delta > 0 ? "up" : "down";
  }

  return { metric, baseline, latest, description, delta, trend };
}

function TrendBadge({ trend, delta }: { trend: "up" | "down" | "stable"; delta: number | null }) {
  if (trend === "stable")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/60">
        ● Stable
      </span>
    );
  const color = trend === "up" ? "text-amber-300 bg-amber-400/15" : "text-sky-300 bg-sky-400/15";
  const arrow = trend === "up" ? "↑" : "↓";
  const label = delta != null ? `${arrow} ${Math.abs(delta).toFixed(4)}` : arrow;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
}

type DashboardData = {
  risk_level: string;
  conditions_flagged: string[];
  confidence_score: number;
  explanation: string[];
  research_references_used: string[];
  total_tests_done: number;
  last_assessment_at: string;
  baseline_assessment_at: string;
  patient_name: string;
  has_clinical_summary: boolean;
};

type SessionRecord = {
  timestamp?: string;
  time_series?: Array<Record<string, unknown>>;
  session_averages?: Record<string, number | null>;
  baseline_snapshot?: Record<string, number | null>;
  derived_metrics?: {
    deltas_vs_baseline?: Record<string, number | null>;
  };
  gemini_summary?: {
    risk_level?: string;
    conditions_flagged?: string[];
    confidence_score?: number;
    explanation?: string[];
    research_references_used?: string[];
    patient_name?: string;
  };
};

type PatientRecord = {
  name?: string;
  created_at?: string;
};

function formatMetricEntry(
  metricKey: string,
  baselineValue: number | null | undefined,
  latestValue: number | null | undefined,
  deltaValue: number | null | undefined,
): string | null {
  if (latestValue == null) return null;

  const baseline = baselineValue ?? latestValue;
  const latest = latestValue;
  const delta = deltaValue ?? (baseline != null ? latest - baseline : 0);
  const trend = delta > 0 ? "increased" : delta < 0 ? "decreased" : "stable";
  const evidence =
    delta === 0
      ? "Initial baseline session captured for this metric."
      : `Metric ${trend} by ${Math.abs(delta).toFixed(4)} versus baseline.`;

  return `${metricKey}:${baseline}:${latest}:${evidence}`;
}

function getRiskStyle(level: string) {
  switch (level) {
    case "high":
      return { bg: "#ef4444", bgLight: "#ef444415", border: "#ef444440", label: "High risk" };
    case "moderate":
    case "medium":
      return { bg: "#f59e0b", bgLight: "#f59e0b15", border: "#f59e0b40", label: "Moderate risk" };
    case "low":
      return { bg: "#10b981", bgLight: "#10b98115", border: "#10b98140", label: "Low risk" };
    default:
      return { bg: "#6b7280", bgLight: "#6b728015", border: "#6b728040", label: level };
  }
}

export function DashboardScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout, user, getCurrentPatientId } = useAuth();

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nameFromUrl = searchParams.get("name");
  const fallbackPatientName = user?.name || nameFromUrl?.trim() || "Patient";

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      const resolvedPatientId = await getCurrentPatientId();
      if (!resolvedPatientId) {
        if (!cancelled) {
          setDashboardData(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Patient data now comes from /auth/whoami (users collection)
        const userId = user?.userId || "";
        const [whoamiRes, sessionsRes] = await Promise.all([
          userId
            ? fetch(buildApiUrl(`/auth/whoami?user_id=${encodeURIComponent(userId)}`))
            : Promise.resolve(null),
          fetch(buildApiUrl(`/session/${encodeURIComponent(resolvedPatientId)}`)),
        ]);

        const patientData: PatientRecord =
          whoamiRes && whoamiRes.ok ? await whoamiRes.json() : {};
        const sessionsData: SessionRecord[] = sessionsRes.ok
          ? await sessionsRes.json()
          : [];

        const latest = sessionsData.length > 0 ? sessionsData[sessionsData.length - 1] : null;
        const first = sessionsData.length > 0 ? sessionsData[0] : null;
        const persistedSummary = loadLatestGeminiSummary(resolvedPatientId) || {};
        const summary = {
          ...persistedSummary,
          ...(latest?.gemini_summary || {}),
        };
        const sessionAverages = latest?.session_averages || {};
        const baselineSnapshot = latest?.baseline_snapshot || {};
        const deltas = latest?.derived_metrics?.deltas_vs_baseline || {};

        const hasSummaryData =
          !!summary.risk_level ||
          typeof summary.confidence_score === "number" ||
          (Array.isArray(summary.explanation) && summary.explanation.length > 0) ||
          (Array.isArray(summary.conditions_flagged) && summary.conditions_flagged.length > 0);

        const fallbackExplanation = Object.keys(sessionAverages)
          .map((metricKey) =>
            formatMetricEntry(
              metricKey,
              baselineSnapshot[metricKey],
              sessionAverages[metricKey],
              deltas[`delta_${metricKey}`],
            )
          )
          .filter((entry): entry is string => !!entry);

        const explanationFromSummary = Array.isArray(summary.explanation) ? summary.explanation : [];
        const explanation = explanationFromSummary.length > 0 ? explanationFromSummary : fallbackExplanation;

        if (!latest) {
          if (!cancelled) {
            setDashboardData(null);
            setLoading(false);
          }
          return;
        }

        const mapped: DashboardData = {
          risk_level: summary.risk_level || "inconclusive",
          conditions_flagged: Array.isArray(summary.conditions_flagged)
            ? summary.conditions_flagged
            : [],
          confidence_score:
            typeof summary.confidence_score === "number"
              ? summary.confidence_score
              : 0,
          explanation,
          research_references_used: Array.isArray(summary.research_references_used)
            ? summary.research_references_used
            : [],
          total_tests_done: Array.isArray(latest.time_series) ? latest.time_series.length : 0,
          last_assessment_at:
            latest.timestamp || patientData.created_at || new Date().toISOString(),
          baseline_assessment_at:
            first?.timestamp || patientData.created_at || new Date().toISOString(),
          patient_name:
            summary.patient_name || patientData.name || fallbackPatientName,
          has_clinical_summary: hasSummaryData,
        };

        if (!cancelled) {
          setDashboardData(mapped);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Could not load dashboard data.");
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [getCurrentPatientId, fallbackPatientName]);

  const data = dashboardData;
  const riskStyle = getRiskStyle(data?.risk_level || "inconclusive");
  const hasData = !!data;

  const dashboardTranscript = useMemo(() => {
    if (!data) {
      return "No data to display yet. Take your first baseline test to generate dashboard insights.";
    }
    return [
      `Assessment dashboard for ${data.patient_name}.`,
      data.has_clinical_summary ? `Risk level is ${riskStyle.label.toLowerCase()}.` : "",
      data.conditions_flagged.length
        ? `Conditions flagged: ${data.conditions_flagged.map((c) => c.replace(/_/g, " ")).join(", ")}.`
        : "",
      data.has_clinical_summary ? `Confidence score is ${(data.confidence_score * 100).toFixed(0)} percent.` : "",
      `${data.total_tests_done} tests completed. Last assessment ${new Date(data.last_assessment_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
    ]
      .filter(Boolean)
      .join(" ");
  }, [data, riskStyle.label]);

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
              onClick={(e: React.MouseEvent) => {
                const params = e.shiftKey ? "demo=1" : "";
                navigate(`/instructions${params ? `?${params}` : ""}`);
              }}
              className="bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Start assessment
            </Button>
            <Button
              variant="outline"
              className="border-white/10 bg-white/5 text-white hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300"
              onClick={() => { logout(); navigate("/"); }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>

        {loading && (
          <Card className="p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-white/80">
            Loading dashboard data...
          </Card>
        )}

        {!loading && error && (
          <Card className="p-6 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
            {error}
          </Card>
        )}

        {!loading && !error && !hasData && (
          <Card className="p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl text-center space-y-4">
            <p className="text-white text-lg font-semibold">No data to display, take your first test!</p>
            <div>
              <Button
                onClick={() => navigate("/baseline")}
                className="bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white"
              >
                Take baseline test
              </Button>
            </div>
          </Card>
        )}

        {!loading && !error && hasData && (
          <>
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
                  {data.has_clinical_summary ? riskStyle.label : "No data"}
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
                {data.conditions_flagged.length > 0 ? data.conditions_flagged.map((c) => (
                  <Badge
                    key={c}
                    variant="destructive"
                    className="bg-red-500/20 text-red-300 border-red-500/30"
                  >
                    {c.replace(/_/g, " ")}
                  </Badge>
                )) : <span className="font-semibold capitalize" style={{ color: riskStyle.bg }}>No conditions</span>}
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
                  {data.has_clinical_summary ? `${(data.confidence_score * 100).toFixed(0)}%` : "0%"}
                </p>
                <Progress
                  value={data.has_clinical_summary ? data.confidence_score * 100 : 0}
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
                {(data.explanation.length > 0 ? data.explanation : ["NO DATA"]).map((line, i) => {
                  if (line === "NO DATA") {
                    return (
                      <li key={i}>
                        <Card className="p-4 bg-white/5 border border-white/10 rounded-lg">
                          <p className="text-sm text-white/60">NO DATA</p>
                        </Card>
                      </li>
                    );
                  }
                  const { metric, baseline, latest, description, delta, trend } = parseExplanationLine(line);
                  return (
                    <li key={i}>
                      <Card className="p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            {/* Metric name + trend badge */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-[#00d4ff] capitalize">
                                {metric}
                              </p>
                              <TrendBadge trend={trend} delta={delta} />
                            </div>
                            {/* Baseline vs Latest values */}
                            {(baseline || latest) && (
                              <div className="flex items-center gap-4">
                                {baseline && (
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wider text-white/40">Baseline</span>
                                    <p className="text-sm font-medium text-white/70 tabular-nums">{baseline}</p>
                                  </div>
                                )}
                                {baseline && latest && (
                                  <span className="text-white/20 text-lg">→</span>
                                )}
                                {latest && (
                                  <div>
                                    <span className="text-[10px] uppercase tracking-wider text-white/40">Latest</span>
                                    <p className="text-sm font-medium text-white tabular-nums">{latest}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Description */}
                            <p className="text-xs leading-relaxed text-white/60">{description}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-white/30 shrink-0 mt-1" />
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
              {(data.research_references_used.length > 0 ? data.research_references_used : ["NO DATA"]).map((ref, i) => (
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
          </>
        )}
      </div>

      <VoiceAssistantButton transcript={dashboardTranscript} />
    </div>
  );
}
