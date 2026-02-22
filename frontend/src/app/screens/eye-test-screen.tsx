import { useNavigate } from "react-router";
import { X } from "lucide-react";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Button } from "../components/ui/button";
import { VoiceAssistantButton } from "../components/voice-assistant-button";
import type { FaceMeshResults } from "../../global";

// --- Ocular test constants (from AURA kinematics) ---
const VELOCITY_SCALE = 2500;
const CALIBRATION_DURATION_MS = 4000;
const THRESHOLD_OFFSET = 0.1;
const EXAM_CYCLES = 5;
const EXAM_POSITION_DURATION_MS = 1500;
const PEAK_TRACK_INTERVAL_MS = 50;
const DEPRESSION_MULTIPLIER = 1.2;
const DETECTION_INTERVAL_MS = 66;
const UI_UPDATE_INTERVAL_MS = 150;
const CHART_UPDATE_INTERVAL_MS = 100;
const CHART_SLIDING_WINDOW = 300;
const HISTORY_LEN = 5;
const FLASH_DURATION_MS = 800;

const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;
const IRIS_LEFT = 469;
const IRIS_RIGHT = 471;

const EXAM_POSITIONS = [
  { left: "10%", top: "50%" },
  { left: "90%", top: "50%" },
];

export function EyeTestScreen() {
  const navigate = useNavigate();
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

  const historyRef = useRef<Array<{ x: number; t: number }>>([]);
  const calibDataRef = useRef<number[]>([]);
  const examSaccadePeaksRef = useRef<number[]>([]);
  const forceFailRef = useRef(false);
  const peakTrackerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVelocityRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastChartUpdateRef = useRef(0);

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

        const irisWidth = Math.sqrt(
          Math.pow(landmarks[IRIS_RIGHT].x - landmarks[IRIS_LEFT].x, 2) +
            Math.pow(landmarks[IRIS_RIGHT].y - landmarks[IRIS_LEFT].y, 2)
        );
        const pctStr = (irisWidth * 100).toFixed(1) + "%";
        if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
          setIrisSizePct(pctStr);
        }

        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 2;
        [leftIris, rightIris].forEach((eye) => {
          ctx.beginPath();
          ctx.arc(
            eye.x * canvas.width,
            eye.y * canvas.height,
            irisWidth * canvas.width * 0.6,
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
    examSaccadePeaksRef.current = [];

    const chart = chartInstanceRef.current;
    if (chart) {
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
      chart.data.datasets[1].data = [];
      chart.update();
    }

    setStatusText("PHASE 1: SACCADIC TRIALS (TRACK THE DOT)");
    setShowTargetDot(true);

    for (let i = 0; i < EXAM_CYCLES; i++) {
      for (const pos of EXAM_POSITIONS) {
        setTargetPosition(pos);
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
      }
    }

    setShowTargetDot(false);
    setStatusText("PHASE 2: PUPILLARY STIMULUS (FLASH)");
    setShowFlash(true);
    await new Promise((r) => setTimeout(r, FLASH_DURATION_MS));
    setShowFlash(false);

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
    setShowResultsModal(true);
    setExamBtnDisabled(false);
  }, [threshold]);

  const handleDismissResults = () => {
    setShowResultsModal(false);
    forceFailRef.current = false;
  };

  const handleContinue = () => {
    navigate("/voice-test");
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
        <div className="w-full max-w-6xl h-80 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 relative overflow-hidden">
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
              2. Start AURA Exam (30s)
            </Button>
            {showResultsModal && (
              <Button
                onClick={handleContinue}
                className="col-span-2 h-11 rounded-xl font-semibold bg-[#00d4ff] text-[#0a0f1e] hover:opacity-90"
              >
                Continue to Voice Test
              </Button>
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
            onClick={() => navigate("/")}
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
