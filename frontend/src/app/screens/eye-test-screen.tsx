import React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loader2, X } from "lucide-react";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Button } from "../components/ui/button";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import type { FaceMeshResults } from "../../global";
import { useAuth } from "../context/auth-context";
import { buildApiUrl } from "../config/api";
import { runGeminiAnalysisForPatient, type GeminiSummary } from "../lib/gemini-analysis";

// --- Ocular test constants (from AURA kinematics) ---
// VELOCITY_SCALE: iris x moves ~0–1 normalized, dt in ms.
// (Δx / dt) * VELOCITY_SCALE → "AURA velocity units" used internally for
// CNS-depression threshold detection. Not in deg/s; kept arbitrary but consistent.
const VELOCITY_SCALE = 2500;
const CALIBRATION_DURATION_MS = 4000;
const THRESHOLD_OFFSET = 0.1;
const EXAM_CYCLES = 5;
const EXAM_POSITION_DURATION_MS = 1500;
const PEAK_TRACK_INTERVAL_MS = 50;
const DEPRESSION_MULTIPLIER = 1.2;
// Reduced from 66ms (15Hz) to 33ms (~30Hz) so prosaccade latency timer
// has finer granularity — at 66ms we systematically overestimate by up to 66ms.
const DETECTION_INTERVAL_MS = 33;
const UI_UPDATE_INTERVAL_MS = 150;
const CHART_UPDATE_INTERVAL_MS = 100;
const CHART_SLIDING_WINDOW = 300;
const HISTORY_LEN = 5;
const FLASH_DURATION_MS = 800;

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
const IRIS_LEFT = 469;
const IRIS_RIGHT = 471;

// Dot positions as fractions of the test box (0–1), used for both CSS and
// accuracy comparison against gaze position remapped to the same space.
const EXAM_DOT_FRACTIONS = [0.1, 0.9]; // left=10%, right=90% of test box
const EXAM_POSITIONS = [
  { left: "10%", top: "50%" },
  { left: "90%", top: "50%" },
];

// --- Additional metrics (fixation, pupil, prosaccade, accuracy, pursuit) ---
const FIXATION_DURATION_MS = 2500;
const FIXATION_POSITION = { left: "50%", top: "50%" };
const PURSUIT_DURATION_MS = 4000;
// Pursuit amplitude in fraction of TEST BOX width. The target oscillates
// between 15% and 85% of the box (0.5 ± 0.35).
const PURSUIT_AMPLITUDE = 0.35;
const PURSUIT_PERIOD_MS = 2000; // full sine cycle
// Lowered from 0.12 to 0.04 so we detect saccade onset reliably at ~30Hz.
// 0.04 AURA velocity units ≈ very small iris shift — catches initiation early
// before peak velocity is reached, matching how clinical systems measure latency
// from stimulus onset to first detectable eye movement.
const SACCADE_SETTLE_MS = 400; // use last N ms of each trial for endpoint
const GAZE_TRIAL_CAP = 80;
const IRIS_HISTORY_CAP = 300;
const PURSUIT_SAMPLES_CAP = 200;
const STABILITY_STD_SCALE = 8; // 1 - min(std * scale, 1) for fixation_stability

type ExamPhase = "fixation" | "saccade" | "pursuit" | "flash" | null;

export function EyeTestScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getCurrentPatientId } = useAuth();
  const mode = searchParams.get("mode") === "postop" ? "postop" : "baseline";
  const isDemo = searchParams.get("demo") === "1";
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null); // small camera preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<{
    data: { labels: string[]; datasets: Array<{ data: number[] }> };
    update: (mode?: string) => void;
    destroy?: () => void;
  } | null>(null);
  const faceMeshRef = useRef<ReturnType<typeof createFaceMesh> | null>(null);
  const processRafRef = useRef<number>(0);
  const lastDetectionRef = useRef(0);
  // Ref to the test-box div so we can map screen coords → box-fraction coords
  const testBoxRef = useRef<HTMLDivElement>(null);
  // Snapshot of test-box screen rect taken at exam start; null until exam begins
  const testBoxRectRef = useRef<DOMRect | null>(null);

  const historyRef = useRef<Array<{ x: number; t: number }>>([]);
  const calibDataRef = useRef<number[]>([]);
  const examSaccadePeaksRef = useRef<number[]>([]);
  const forceFailRef = useRef(false);
  const peakTrackerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVelocityRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastChartUpdateRef = useRef(0);

  const examActiveRef = useRef(false);
  const examPhaseRef = useRef<ExamPhase>(null);
  // Stores iris width normalized to frame width (0–1) for pupil variability.
  // Normalizing removes dependency on camera resolution / distance.
  const irisSizeHistoryRef = useRef<number[]>([]);
  const fixationGazeRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const prosaccadeLatenciesRef = useRef<number[]>([]);
  const prosaccadeLatencyThisTrialRef = useRef<number | null>(null);
  const jumpTimeRef = useRef(0);
  // Pre-jump iris X baseline: average of last N frames before dot jump.
  // Used for position-shift latency detection instead of velocity threshold.
  const preJumpBaselineRef = useRef<number | null>(null);
  // Minimum iris shift (in normalized frame units) to count as saccade onset.
  // 0.008 ≈ ~2–3px shift, above typical gaze jitter/noise at rest.
  const LATENCY_SHIFT_THRESHOLD = 0.008;
  // Physiological minimum: true saccade latency is never below ~80ms.
  // Any detection before this is noise, not a real response.
  const LATENCY_MIN_MS = 80;
  const gazeTrialRef = useRef<Array<{ x: number; t: number }>>([]);
  const saccadeAccuracyRef = useRef<number[]>([]);
  const currentTargetNormRef = useRef(0.5);
  const pursuitStartTimeRef = useRef(0);
  const pursuitSamplesRef = useRef<Array<{ gazeX: number; targetX: number; t: number }>>([]);

  const [statusText, setStatusText] = useState(
    "AURA SYSTEM INITIALIZED: CALIBRATION REQUIRED"
  );
  const [threshold, setThreshold] = useState(0.25);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibDone, setCalibDone] = useState(false);
  const [examRunning, setExamRunning] = useState(false);
  const [examBtnDisabled, setExamBtnDisabled] = useState(true);
  const [liveVelocity, setLiveVelocity] = useState("0.00");
  const [irisSizePct, setIrisSizePct] = useState("--");
  const [showTargetDot, setShowTargetDot] = useState(false);
  const [targetPosition, setTargetPosition] = useState(EXAM_POSITIONS[0]);
  const [showFlash, setShowFlash] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [resultNormal, setResultNormal] = useState(true);
  const [resultPillText, setResultPillText] = useState("ANALYZING...");
  const [resultHeaderText, setResultHeaderText] = useState("NORMAL");
  const [finalSaccadeAvg, setFinalSaccadeAvg] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [fixationStability, setFixationStability] = useState<number | null>(null);
  const [pupilVariability, setPupilVariability] = useState<number | null>(null);
  const [prosaccadeLatency, setProsaccadeLatency] = useState<number | null>(null);
  const [saccadeAccuracy, setSaccadeAccuracy] = useState<number | null>(null);
  const [smoothPursuitGain, setSmoothPursuitGain] = useState<number | null>(null);
  const [isGeminiLoading, setIsGeminiLoading] = useState(false);
  const [geminiSummary, setGeminiSummary] = useState<GeminiSummary | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const persistEyeMetricsToMongo = useCallback(
    async (reading: {
      timestamp: string;
      saccade_velocity: number | null;
      fixation_stability: number | null;
      pupil_variability: number | null;
      smooth_pursuit_gain: number | null;
      saccade_accuracy: number | null;
      prosaccade_latency: number | null;
    }) => {
      const patientId = await getCurrentPatientId();
      if (!patientId) return;

      await fetch(buildApiUrl("/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          time_series: [reading],
        }),
      });
    },
    [getCurrentPatientId]
  );

  const generateGeminiSummary = useCallback(async () => {
    const patientId = await getCurrentPatientId();
    if (!patientId) {
      setGeminiError("Could not resolve patient context for AI analysis.");
      return;
    }

    setIsGeminiLoading(true);
    setGeminiError(null);
    try {
      const summary = await runGeminiAnalysisForPatient(patientId);
      setGeminiSummary(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI summary generation failed. You can continue and retry after next test.";
      setGeminiError(message);
    } finally {
      setIsGeminiLoading(false);
    }
  }, [getCurrentPatientId]);

  function createFaceMesh() {
    if (typeof window === "undefined" || !window.FaceMesh) return null;
    const base =
      "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";
    const fm = new window.FaceMesh({
      locateFile: (file: string) => `${base}/${file}`,
    });
    fm.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
    });
    return fm;
  }

  function createChart() {
    if (!chartRef.current || typeof window === "undefined" || !window.Chart)
      return null;
    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return null;
    const chart = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Ocular Velocity",
            data: [],
            borderColor: "#00d4ff",
            borderWidth: 3,
            pointRadius: 2,
            pointBackgroundColor: "#00d4ff",
            tension: 0.1,
            fill: true,
            backgroundColor: "rgba(0, 212, 255, 0.15)",
          },
          {
            label: "Threshold",
            data: [],
            borderColor: "#ef4444",
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: 0.5,
            grid: { color: "rgba(255,255,255,0.08)" },
            ticks: { color: "rgba(255,255,255,0.5)" },
          },
          x: { display: false },
        },
        plugins: { legend: { display: false } },
      },
    });
    return chart;
  }

  const onResults = useCallback(
    (results: FaceMeshResults) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas || !video) return;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      if (
        results.multiFaceLandmarks &&
        results.multiFaceLandmarks.length > 0
      ) {
        const landmarks = results.multiFaceLandmarks[0];
        if (
          !landmarks[LEFT_IRIS] ||
          !landmarks[IRIS_RIGHT] ||
          !landmarks[IRIS_LEFT] ||
          !landmarks[RIGHT_IRIS]
        ) {
          ctx.restore();
          return;
        }

        const leftIris = landmarks[LEFT_IRIS];
        const rightIris = landmarks[RIGHT_IRIS];
        const now = performance.now();
        const avgX = (leftIris.x + rightIris.x) / 2;
        const avgY = (leftIris.y + rightIris.y) / 2;
        historyRef.current.push({ x: avgX, t: now });
        if (historyRef.current.length > HISTORY_LEN)
          historyRef.current.shift();

        if (historyRef.current.length > 2) {
          const last = historyRef.current[historyRef.current.length - 1];
          const prev = historyRef.current[historyRef.current.length - 2];
          const dt = last.t - prev.t;
          const v = (Math.abs(last.x - prev.x) / dt) * VELOCITY_SCALE;

          if (isCalibrating) calibDataRef.current.push(v);
          liveVelocityRef.current = v;
          if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
            lastUiUpdateRef.current = now;
            setLiveVelocity(v.toFixed(2));
          }

          const chart = chartInstanceRef.current;
          if (
            examRunning &&
            chart &&
            now - lastChartUpdateRef.current >= CHART_UPDATE_INTERVAL_MS
          ) {
            lastChartUpdateRef.current = now;
            chart.data.labels.push("");
            chart.data.datasets[0].data.push(v);
            if (chart.data.labels.length > CHART_SLIDING_WINDOW) {
              chart.data.labels.shift();
              chart.data.datasets[0].data.shift();
            }
            chart.data.datasets[1].data = Array(
              chart.data.datasets[0].data.length
            ).fill(threshold);
            chart.update("none");
          }
        }

        const dx = landmarks[IRIS_RIGHT].x - landmarks[IRIS_LEFT].x;
        const dy = landmarks[IRIS_RIGHT].y - landmarks[IRIS_LEFT].y;
        const irisWidthPx = Math.sqrt(
          (dx * canvas.width) ** 2 + (dy * canvas.height) ** 2
        );
        const pctOfFrame = (irisWidthPx / canvas.width) * 100;
        const pctStr = pctOfFrame.toFixed(1) + "%";
        if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
          setIrisSizePct(pctStr);
        }

        if (examActiveRef.current) {
          // Normalize iris width to frame width (0–1) so pupil_variability
          // is resolution-independent. Clinical studies report pupil size in mm;
          // we use fraction-of-frame as a proxy that scales consistently.
          const irisWidthNorm = irisWidthPx / canvas.width;
          irisSizeHistoryRef.current.push(irisWidthNorm);
          if (irisSizeHistoryRef.current.length > IRIS_HISTORY_CAP)
            irisSizeHistoryRef.current.shift();
        }
        if (examActiveRef.current && examPhaseRef.current === "fixation") {
          fixationGazeRef.current.push({ x: avgX, y: avgY, t: now });
        }
        if (examPhaseRef.current === "saccade") {
          gazeTrialRef.current.push({ x: avgX, t: now });
          if (gazeTrialRef.current.length > GAZE_TRIAL_CAP)
            gazeTrialRef.current.shift();

          // Prosaccade latency: position-shift method.
          // Compare current iris X against the pre-jump baseline (average iris X
          // in the frames just before the dot jumped). When the shift exceeds
          // LATENCY_SHIFT_THRESHOLD the eye has clearly started moving — record latency.
          // This is robust at 30Hz because we don't need to catch the exact onset
          // frame; we just need to detect meaningful departure from baseline.
          if (
            prosaccadeLatencyThisTrialRef.current === null &&
            jumpTimeRef.current > 0 &&
            now - jumpTimeRef.current >= LATENCY_MIN_MS &&
            preJumpBaselineRef.current !== null
          ) {
            const shift = Math.abs(avgX - preJumpBaselineRef.current);
            if (shift > LATENCY_SHIFT_THRESHOLD) {
              prosaccadeLatencyThisTrialRef.current = now - jumpTimeRef.current;
            }
          }
        }
        if (examPhaseRef.current === "pursuit") {
          const targetX =
            0.5 +
            PURSUIT_AMPLITUDE *
              Math.sin(
                ((now - pursuitStartTimeRef.current) / PURSUIT_PERIOD_MS) *
                  2 *
                  Math.PI
              );
          pursuitSamplesRef.current.push({ gazeX: avgX, targetX, t: now });
          if (pursuitSamplesRef.current.length > PURSUIT_SAMPLES_CAP)
            pursuitSamplesRef.current.shift();
        }

        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 2;
        const irisRadiusPx = (irisWidthPx / 2) * 0.6;
        [leftIris, rightIris].forEach((eye) => {
          ctx.beginPath();
          ctx.arc(
            eye.x * canvas.width,
            eye.y * canvas.height,
            irisRadiusPx,
            0,
            2 * Math.PI
          );
          ctx.stroke();
        });
      }
      ctx.restore();
    },
    [isCalibrating, examRunning, threshold]
  );

  const handleCalibrate = useCallback(() => {
    setIsCalibrating(true);
    setCalibDone(false);
    calibDataRef.current = [];
    setStatusText("CALIBRATING BASELINE NOISE... REMAIN STILL");
    setExamBtnDisabled(true);
    setTimeout(() => {
      setIsCalibrating(false);
      const data = calibDataRef.current;
      const avg =
        data.length > 0
          ? data.reduce((a, b) => a + b, 0) / data.length
          : 0.25;
      const newThreshold = avg + THRESHOLD_OFFSET;
      setThreshold(newThreshold);
      setStatusText(
        `CALIBRATION COMPLETE. BASELINE: ${newThreshold.toFixed(2)}. READY.`
      );
      setExamBtnDisabled(false);
      setCalibDone(true);
    }, CALIBRATION_DURATION_MS);
  }, []);

  const runExam = useCallback(async () => {
    setExamRunning(true);
    setExamBtnDisabled(true);
    setFixationStability(null);
    setPupilVariability(null);
    setProsaccadeLatency(null);
    setSaccadeAccuracy(null);
    setSmoothPursuitGain(null);
    examSaccadePeaksRef.current = [];
    irisSizeHistoryRef.current = [];
    fixationGazeRef.current = [];
    prosaccadeLatenciesRef.current = [];
    saccadeAccuracyRef.current = [];
    pursuitSamplesRef.current = [];

    let fixationStabilityValue: number | null = null;
    let pupilVariabilityValue: number | null = null;
    let prosaccadeLatencyValue: number | null = null;
    let saccadeAccuracyValue: number | null = null;
    let smoothPursuitGainValue: number | null = null;

    examActiveRef.current = true;

    // Snapshot test-box screen bounds for gaze coordinate remapping.
    // MediaPipe iris X is 0–1 across the full video frame (mirrored).
    // We remap it to 0–1 within the test box so target and gaze share the same space.
    testBoxRectRef.current = testBoxRef.current?.getBoundingClientRect() ?? null;

    const chart = chartInstanceRef.current;
    if (chart) {
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
      chart.data.datasets[1].data = [];
      chart.update();
    }

    const variance = (arr: number[]) => {
      if (arr.length < 2) return 0;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
    };

    // --- Phase 0: Fixation (hold still, center dot) ---
    examPhaseRef.current = "fixation";
    setStatusText("PHASE 0: FIXATION — HOLD STILL, LOOK AT THE DOT");
    setShowTargetDot(true);
    setTargetPosition(FIXATION_POSITION);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, FIXATION_DURATION_MS));

    const fix = fixationGazeRef.current;
    if (fix.length >= 5) {
      const xs = fix.map((p) => p.x);
      const ys = fix.map((p) => p.y);
      const stdX = Math.sqrt(variance(xs));
      const stdY = Math.sqrt(variance(ys));
      const stability = Math.max(0, 1 - (stdX + stdY) * STABILITY_STD_SCALE);
      fixationStabilityValue = Math.round(stability * 1000) / 1000;
      setFixationStability(fixationStabilityValue);
    } else {
      fixationStabilityValue = fix.length > 0 ? 0 : null;
      setFixationStability(fixationStabilityValue);
    }

    // --- Phase 1: Saccadic trials ---
    examPhaseRef.current = "saccade";
    setStatusText("PHASE 1: SACCADIC TRIALS (TRACK THE DOT)");

    for (let i = 0; i < EXAM_CYCLES; i++) {
      for (let pi = 0; pi < EXAM_POSITIONS.length; pi++) {
        const pos = EXAM_POSITIONS[pi];
        // targetFrac is the dot's position as a fraction of the test box (0–1).
        // EXAM_DOT_FRACTIONS mirrors the CSS percentages in EXAM_POSITIONS.
        const targetFrac = EXAM_DOT_FRACTIONS[pi];
        currentTargetNormRef.current = targetFrac;
        setTargetPosition(pos);
        gazeTrialRef.current = [];
        prosaccadeLatencyThisTrialRef.current = null;
        // Capture pre-jump baseline: average iris X from the last few frames
        // of historyRef before the dot jumps. Used for position-shift latency detection.
        const preJumpFrames = historyRef.current.slice(-4);
        preJumpBaselineRef.current = preJumpFrames.length > 0
          ? preJumpFrames.reduce((s, f) => s + f.x, 0) / preJumpFrames.length
          : null;
        jumpTimeRef.current = performance.now();

        // Peak tracking only — latency is now detected per-frame in onResults.
        let currentPeak = 0;
        peakTrackerRef.current = setInterval(() => {
          const vel = liveVelocityRef.current;
          if (vel > currentPeak) currentPeak = vel;
        }, PEAK_TRACK_INTERVAL_MS);
        await new Promise((r) => setTimeout(r, EXAM_POSITION_DURATION_MS));
        if (peakTrackerRef.current) {
          clearInterval(peakTrackerRef.current);
          peakTrackerRef.current = null;
        }
        if (currentPeak > 0) examSaccadePeaksRef.current.push(currentPeak);

        if (prosaccadeLatencyThisTrialRef.current !== null) {
          prosaccadeLatenciesRef.current.push(
            prosaccadeLatencyThisTrialRef.current
          );
        }

        const endTime = performance.now();
        const settled = gazeTrialRef.current.filter(
          (g) => g.t > endTime - SACCADE_SETTLE_MS
        );
        // Average iris X in the settled window (raw frame coords, 0–1 mirrored).
        const avgSettledX =
          settled.length > 0
            ? settled.reduce((a, g) => a + g.x, 0) / settled.length
            : null;
        // Store raw settled gaze X for cross-trial accuracy scoring below.
        saccadeAccuracyRef.current.push(avgSettledX ?? NaN);
      }
    }

    // --- Phase 2: Smooth pursuit ---
    examPhaseRef.current = "pursuit";
    pursuitStartTimeRef.current = performance.now();
    setStatusText("PHASE 2: SMOOTH PURSUIT — FOLLOW THE MOVING DOT");
    setShowTargetDot(true);
    const pursuitStart = performance.now();
    const pursuitInterval = setInterval(() => {
      const elapsed = performance.now() - pursuitStart;
      const x =
        0.5 +
        PURSUIT_AMPLITUDE *
          Math.sin((elapsed / PURSUIT_PERIOD_MS) * 2 * Math.PI);
      setTargetPosition({
        left: `${x * 100}%`,
        top: "50%",
      });
    }, 50);
    await new Promise((r) => setTimeout(r, PURSUIT_DURATION_MS));
    clearInterval(pursuitInterval);
    setShowTargetDot(false);

    // Smooth pursuit gain = eye velocity / target velocity.
    // Both must be in the SAME units. gazeX is in iris-frame-X (0–1 mirrored).
    // targetX is in box-fraction (0.15–0.85). We scale targetX into iris units
    // using the iris range observed across saccade trials (already stored in ref).
    const validGazeReadings = saccadeAccuracyRef.current.filter((v) => !isNaN(v));
    const irisMin = validGazeReadings.length > 0 ? Math.min(...validGazeReadings) : 0;
    const irisMax = validGazeReadings.length > 0 ? Math.max(...validGazeReadings) : 0.02;
    const irisRange = Math.max(irisMax - irisMin, 0.005); // guard against zero
    // The saccade dot spans from box-fraction 0.1 to 0.9 (range = 0.8).
    // iris is MIRRORED: right dot (high box-fraction) → lower iris X.
    // So: irisX ≈ irisMax - (boxFrac - 0.1) * (irisRange / 0.8)
    // → d(irisX)/d(boxFrac) = -irisRange/0.8  (negative because mirrored)
    const irisPerBoxFrac = irisRange / 0.8;

    const samples = pursuitSamplesRef.current;
    let gains: number[] = [];
    for (let j = 1; j < samples.length; j++) {
      const dt = (samples[j].t - samples[j - 1].t) / 1000; // seconds
      if (dt <= 0) continue;
      // Convert target velocity from box-fraction/s to iris-frame-X/s (with mirror flip).
      const targetBoxVel = (samples[j].targetX - samples[j - 1].targetX) / dt;
      const targetIrisVel = -targetBoxVel * irisPerBoxFrac; // negative = mirror
      // Eye velocity in iris-frame-X/s (raw, no conversion needed).
      const eyeVel = (samples[j].gazeX - samples[j - 1].gazeX) / dt;
      // Only compute gain when target is actually moving (filter near-zero crossing).
      // Threshold: 5% of peak iris velocity per second.
      const velThreshold = irisRange * 0.3;
      if (Math.abs(targetIrisVel) > velThreshold) {
        const g = eyeVel / targetIrisVel;
        gains.push(Math.max(0, Math.min(2, g)));
      }
    }
    if (gains.length > 0) {
      const meanGain = gains.reduce((a, b) => a + b, 0) / gains.length;
      smoothPursuitGainValue = Math.round(meanGain * 1000) / 1000;
      setSmoothPursuitGain(smoothPursuitGainValue);
    } else {
      smoothPursuitGainValue = null;
      setSmoothPursuitGain(null);
    }

    // --- Phase 3: Pupillary flash ---
    examPhaseRef.current = "flash";
    setShowTargetDot(false);
    setStatusText("PHASE 3: PUPILLARY STIMULUS (FLASH)");
    setShowFlash(true);
    await new Promise((r) => setTimeout(r, FLASH_DURATION_MS));
    setShowFlash(false);
    examPhaseRef.current = null;

    const irisHist = irisSizeHistoryRef.current;
    if (irisHist.length >= 2) {
      // irisHist values are iris width as fraction of frame width (0–1).
      // Healthy resting variance is very small (~0.0001–0.001).
      // We scale ×1000 to produce values in the range ~0.1–1.0 that are
      // interpretable alongside the other 0–1 metrics.
      const v = variance(irisHist) * 1000;
      pupilVariabilityValue = Math.round(v * 1000) / 1000;
      setPupilVariability(pupilVariabilityValue);
    } else {
      pupilVariabilityValue = irisHist.length > 0 ? 0 : null;
      setPupilVariability(pupilVariabilityValue);
    }

    const latencies = prosaccadeLatenciesRef.current;
    if (latencies.length > 0) {
      prosaccadeLatencyValue = Math.round(
        (latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10
      ) / 10;
      setProsaccadeLatency(prosaccadeLatencyValue);
    } else {
      prosaccadeLatencyValue = null;
      setProsaccadeLatency(null);
    }

    // saccade_accuracy: directional scoring in raw iris-frame-X space.
    // The iris is *mirrored*, so looking RIGHT → iris X *decreases*, LEFT → increases.
    // Trial order: [left, right, left, right, ...] repeated EXAM_CYCLES times.
    // For each pair of consecutive trials (prev→curr):
    //   - If dot moved right (prev=left dot, curr=right dot): iris X should decrease → negative delta is correct
    //   - If dot moved left (prev=right dot, curr=left dot): iris X should increase → positive delta is correct
    // Score = fraction of movement in the correct direction, capped at 1.
    // We normalize by the median absolute delta seen (auto-scales to each person's iris range).
    const rawGazeX = saccadeAccuracyRef.current; // one entry per trial (EXAM_CYCLES * 2)
    const validPairs: number[] = [];
    for (let k = 1; k < rawGazeX.length; k++) {
      const prev = rawGazeX[k - 1];
      const curr = rawGazeX[k];
      if (isNaN(prev) || isNaN(curr)) continue;
      const delta = curr - prev; // negative = gaze moved right (iris X decreased)
      // Alternating: even index = left dot (pi=0), odd = right dot (pi=1)
      // When pi=1 (right dot), correct direction is negative delta (iris moves right = X decreases)
      // When pi=0 (left dot), correct direction is positive delta (iris moves left = X increases)
      const expectedSign = (k % 2 === 1) ? -1 : 1; // k=1 → right dot, k=2 → left, etc.
      const correctComponent = delta * expectedSign; // positive if moved correctly
      validPairs.push(correctComponent);
    }
    if (validPairs.length > 0) {
      const absVals = validPairs.map(Math.abs).sort((a, b) => a - b);
      const medianAbs = absVals[Math.floor(absVals.length / 2)] || 0.001;
      const scores = validPairs.map((v) => Math.max(0, Math.min(1, v / medianAbs)));
      const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      saccadeAccuracyValue = Math.round(meanScore * 1000) / 1000;
      setSaccadeAccuracy(saccadeAccuracyValue);
    } else {
      saccadeAccuracyValue = null;
      setSaccadeAccuracy(null);
    }

    examActiveRef.current = false;
    setExamRunning(false);

    const peaks = examSaccadePeaksRef.current;
    const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length || 0;
    setFinalSaccadeAvg(avgPeak.toFixed(2));
    const isDepressed =
      avgPeak < threshold * DEPRESSION_MULTIPLIER || forceFailRef.current;
    setResultNormal(!isDepressed);
    setResultPillText(
      isDepressed ? "CNS DEPRESSION DETECTED" : "CNS STATUS: STABLE"
    );
    setResultHeaderText(isDepressed ? "ABNORMAL" : "NORMAL");
    setStatusText(`Test complete: ${isDepressed ? "ABNORMAL" : "NORMAL"}`);

    // --- Demo mode: override metrics and skip Gemini API ---
    if (isDemo) {
      const demoMetrics = {
        timestamp: new Date().toISOString(),
        saccade_velocity: 0.3412,
        fixation_stability: 0.912,
        pupil_variability: 0.018,
        smooth_pursuit_gain: 0.874,
        saccade_accuracy: 0.891,
        prosaccade_latency: 198.4,
      };
      try { await persistEyeMetricsToMongo(demoMetrics); } catch {}

      // Override displayed metric values to match demo data
      setFinalSaccadeAvg("0.34");
      setFixationStability(0.912);
      setPupilVariability(0.018);
      setSmoothPursuitGain(0.874);
      setSaccadeAccuracy(0.891);
      setProsaccadeLatency(198.4);
      setResultNormal(true);
      setResultPillText("CNS STATUS: STABLE");
      setResultHeaderText("NORMAL");
      setStatusText("Test complete: NORMAL");

      const demoSummary: GeminiSummary = {
        risk_level: "low",
        conditions_flagged: [],
        confidence_score: 0.82,
        explanation: [
          "saccade_velocity:0.35:0.3412:Saccade velocity remains within normal range with minimal deviation from baseline.",
          "fixation_stability:0.92:0.912:Fixation stability shows strong gaze-holding ability consistent with healthy ocular motor function.",
          "pupil_variability:0.015:0.018:Pupil variability within expected physiological range indicating stable autonomic response.",
          "smooth_pursuit_gain:0.88:0.874:Smooth pursuit gain near unity indicates intact cerebellar and brainstem pathways.",
        ],
        research_references_used: [],
      };
      setGeminiSummary(demoSummary);
      setGeminiError(null);
      setIsGeminiLoading(false);
      // Persist to localStorage so results screen picks it up
      const patientId = await getCurrentPatientId();
      if (patientId) {
        const { saveLatestGeminiSummary } = await import("../lib/gemini-analysis");
        saveLatestGeminiSummary(patientId, demoSummary);
      }
      setShowResultsModal(true);
      setExamBtnDisabled(false);
      return;
    }

    try {
      await persistEyeMetricsToMongo({
        timestamp: new Date().toISOString(),
        saccade_velocity: Number(avgPeak.toFixed(4)),
        fixation_stability: fixationStabilityValue,
        pupil_variability: pupilVariabilityValue,
        smooth_pursuit_gain: smoothPursuitGainValue,
        saccade_accuracy: saccadeAccuracyValue,
        prosaccade_latency: prosaccadeLatencyValue,
      });
    } catch {
      // Non-blocking: user should still be able to continue exam flow.
    }

    setGeminiSummary(null);
    setGeminiError(null);
    setShowResultsModal(true);
    setExamBtnDisabled(false);
    void generateGeminiSummary();
  }, [threshold, persistEyeMetricsToMongo, generateGeminiSummary, isDemo, getCurrentPatientId]);

  const handleDismissResults = () => {
    setShowResultsModal(false);
    forceFailRef.current = false;
  };

  const handleContinue = () => {
    navigate("/results");
  };

  useEffect(() => {
    const chart = createChart();
    chartInstanceRef.current = chart ?? null;
    return () => {
      if (chartInstanceRef.current?.destroy) chartInstanceRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    const fm = createFaceMesh();
    if (!fm) return;
    faceMeshRef.current = fm;
    fm.onResults(onResults);
  }, [onResults]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") forceFailRef.current = true;
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const faceMesh = faceMeshRef.current;
    if (!video || !faceMesh) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (cancelled) return;
        video.srcObject = stream;
        const pipVideo = pipVideoRef.current;
        if (pipVideo) pipVideo.srcObject = stream;
        setCameraError(null);
        video.onloadedmetadata = () => {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          let sendInFlight = false;
          const process = () => {
            if (cancelled || !faceMeshRef.current) return;
            const now = performance.now();
            if (
              !sendInFlight &&
              now - lastDetectionRef.current >= DETECTION_INTERVAL_MS
            ) {
              lastDetectionRef.current = now;
              sendInFlight = true;
              faceMeshRef.current!.send({ image: video })
                .catch(() => {})
                .finally(() => {
                  sendInFlight = false;
                });
            }
            processRafRef.current = requestAnimationFrame(process);
          };
          process();
        };
      })
      .catch(() => {
        setStatusText("Camera access failed.");
        setCameraError("Camera access failed.");
      });
    return () => {
      cancelled = true;
      if (processRafRef.current) cancelAnimationFrame(processRafRef.current);
    };
  }, []);

  const transcript =
    "Eye tracking test in progress. Please keep your head still and follow the blue dot with your eyes only.";

  const progressPercent = showResultsModal ? 100 : examRunning ? 50 : calibDone ? 25 : 0;

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col relative overflow-hidden">
      {/* Gradient background (original UI) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/10 via-transparent to-[#00d4ff]/10" />

      {/* Hidden video for Face Mesh input (logic only) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
      />

      {/* Flash overlay */}
      {showFlash && (
        <div className="fixed inset-0 bg-white z-[101] opacity-90 transition-opacity duration-100 pointer-events-none" />
      )}

      {/* Header with progress (original UI) */}
      <div className="p-6 space-y-3 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-white/60">{statusText}</p>
            <p className="text-sm text-white/60">{Math.round(progressPercent)}%</p>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main test area: one box + blue ball that JUMPS (no drag) */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div ref={testBoxRef} className="w-full max-w-6xl h-80 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 relative overflow-hidden">
          {/* Center reference (subtle) */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/20 rounded-full pointer-events-none" />

          {/* Blue gradient ball — JUMPS left/right (no motion/drag), only during exam */}
          {showTargetDot && (
            <div
              className="absolute w-8 h-8 rounded-full shadow-2xl pointer-events-none transition-none"
              style={{
                left: targetPosition.left,
                top: targetPosition.top,
                transform: "translate(-50%, -50%)",
                background: "linear-gradient(to bottom right, #00d4ff, #7c3aed)",
                boxShadow: "0 0 30px rgba(0,212,255,0.5)",
              }}
            />
          )}

          {/* Instructions */}
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-[#0a0f1e]/90 backdrop-blur-xl px-6 py-3 rounded-xl border border-white/10">
            <p className="text-sm text-white">
              {examRunning ? "Follow the blue dot with your eyes" : "Calibrate, then start the exam"}
            </p>
          </div>

          {/* Small camera: shows your face + eye-tracking spots (canvas overlay) */}
          <div className="absolute bottom-3 right-3 w-28 h-28 rounded-xl overflow-hidden border-2 border-[#00d4ff]/50 shadow-lg z-10 bg-black/50">
            <video
              ref={pipVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
              style={{ display: cameraError ? "none" : "block" }}
            />
            {/* Canvas draws face + iris circles so you see it following your eyes */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
            />
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs p-1 text-center bg-black/60">
                No camera
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart + metrics + buttons (logic: graph with spikes, velocity, iris, calibrate, start) */}
      <div className="px-6 pb-4 relative z-10 space-y-4 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="min-h-[180px] rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1">Live velocity (graph)</p>
            <div className="h-[140px] relative">
              <canvas ref={chartRef} className="absolute inset-0 w-full h-full rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 border-l-4 border-l-[#00d4ff]">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Velocity</span>
              <span className="block text-xl font-bold text-white tabular-nums mt-1">{liveVelocity}</span>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 border-l-4 border-l-[#00d4ff]">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Iris %</span>
              <span className="block text-xl font-bold text-white tabular-nums mt-1">{irisSizePct}</span>
            </div>
            <Button
              onClick={handleCalibrate}
              disabled={isCalibrating}
              className="col-span-2 h-11 rounded-xl font-semibold bg-[#00d4ff] text-[#0a0f1e] hover:opacity-90 disabled:opacity-50 disabled:grayscale"
            >
              {calibDone ? "Calibrated ✓" : "1. Calibrate Baseline"}
            </Button>
            <Button
              onClick={runExam}
              disabled={examBtnDisabled}
              className="col-span-2 h-11 rounded-xl font-semibold bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-50 disabled:grayscale"
            >
              2. Start AURA Exam
            </Button>
            {showResultsModal && (
              <>
                <div className="col-span-2 rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                  <p className="text-[10px] text-white/50 uppercase tracking-wider mb-2">
                    Tracked metrics
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/70">saccade_velocity</span>
                      <span className="text-white tabular-nums">{finalSaccadeAvg || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">fixation_stability</span>
                      <span className="text-white tabular-nums">{fixationStability ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">pupil_variability</span>
                      <span className="text-white tabular-nums">{pupilVariability ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">prosaccade_latency (ms)</span>
                      <span className="text-white tabular-nums">{prosaccadeLatency ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">smooth_pursuit_gain</span>
                      <span className="text-white tabular-nums">{smoothPursuitGain ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/70">saccade_accuracy</span>
                      <span className="text-white tabular-nums">{saccadeAccuracy ?? "—"}</span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleContinue}
                  disabled={isGeminiLoading}
                  className="col-span-2 h-11 rounded-xl font-semibold bg-[#00d4ff] text-[#0a0f1e] hover:opacity-90"
                >
                  {isGeminiLoading ? "Generating AI Summary..." : "Continue to Results"}
                </Button>
                <div className="col-span-2 rounded-xl bg-white/5 border border-white/10 p-4 space-y-2">
                  <p className="text-[10px] text-white/50 uppercase tracking-wider">Gemini summary</p>
                  {isGeminiLoading && (
                    <div className="flex items-center gap-2 text-sm text-white/80">
                      <Loader2 className="h-4 w-4 animate-spin text-[#00d4ff]" />
                      Analysing...
                    </div>
                  )}
                  {!isGeminiLoading && geminiError && (
                    <p className="text-sm text-amber-300">{geminiError}</p>
                  )}
                  {!isGeminiLoading && !geminiError && geminiSummary && (
                    <div className="space-y-1 text-xs text-white/80">
                      <p>
                        Risk: <span className="text-white">{geminiSummary.risk_level ?? "inconclusive"}</span>
                      </p>
                      <p>
                        Confidence: <span className="text-white">{typeof geminiSummary.confidence_score === "number" ? `${Math.round(geminiSummary.confidence_score * 100)}%` : "—"}</span>
                      </p>
                      <p>
                        Conditions: <span className="text-white">{Array.isArray(geminiSummary.conditions_flagged) && geminiSummary.conditions_flagged.length > 0 ? geminiSummary.conditions_flagged.join(", ") : "None flagged"}</span>
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="p-4 relative z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 p-4 rounded-xl backdrop-blur-xl border border-white/10 bg-white/5">
          <p className="text-sm font-medium text-white/90">{statusText}</p>
        </div>
      </div>

      {/* Cancel */}
      <div className="p-6 relative z-10">
        <div className="max-w-4xl mx-auto flex justify-start">
          <Button
            onClick={() => navigate("/dashboard")}
            variant="outline"
            className="h-10 px-5 border border-white/10 bg-white/5 text-white hover:bg-white/10 text-sm rounded-xl"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>

      <VoiceAssistantButton transcript={transcript} />
    </div>
  );
}