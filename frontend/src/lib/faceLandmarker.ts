/**
 * MediaPipe Face Landmarker for ocular follow-the-dot scoring.
 * Loads model from CDN and runs detection on video frames.
 * Tracks left eye iris center and calculates gaze deviation from target dot position.
 */

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export type FaceLandmarkerResult = {
  gazeDeviation: number // Normalized deviation between gaze point and dot position (0.0 to ~2.0)
  gazePosition: { x: number; y: number } // Normalized gaze position in video space (0.0 to 1.0)
  timestamp: number
}

let landmarkerInstance: Awaited<ReturnType<typeof createLandmarker>> | null = null

async function createLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate: 'GPU',
    },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
    runningMode: 'VIDEO',
    numFaces: 1,
  })
  return faceLandmarker
}

export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance
  landmarkerInstance = await createLandmarker()
  return landmarkerInstance
}

// MediaPipe 468 face mesh landmark indices for left eye
// Eye contour points for more reliable tracking
const LEFT_EYE_INNER = 33   // Left eye inner corner
const LEFT_EYE_OUTER = 133  // Left eye outer corner  
const LEFT_EYE_TOP = 159    // Left eye top
const LEFT_EYE_BOTTOM = 145 // Left eye bottom

// Iris landmarks (these track actual pupil position!)
const LEFT_IRIS_TOP = 468         // Top of iris contour
const LEFT_IRIS_BOTTOM = 471      // Bottom of iris contour
const LEFT_IRIS_LEFT = 469        // Left of iris 
const LEFT_IRIS_RIGHT = 470       // Right of iris

/**
 * Calculate gaze direction as iris offset from eye center, normalized by eye width.
 * Returns values in eye-width units — e.g. +0.3 means iris is 30% of eye width to the right of center.
 * This is head-position-independent and directly reflects where the user is looking.
 */
export function getGazePositionFromLandmarks(landmarks: { x: number; y: number; z?: number }[]): { x: number; y: number } {
  if (landmarks.length < 134) {
    return { x: 0, y: 0 }
  }

  // Eye socket bounds used to normalize iris offset (same eye as iris landmarks: image-left / person's right)
  const eyeInner = landmarks[LEFT_EYE_INNER]
  const eyeOuter = landmarks[LEFT_EYE_OUTER]
  const eyeTop = landmarks[LEFT_EYE_TOP]
  const eyeBottom = landmarks[LEFT_EYE_BOTTOM]

  const eyeWidth = Math.abs(eyeOuter.x - eyeInner.x) || 0.01
  const eyeCenterX = (eyeInner.x + eyeOuter.x) / 2
  const eyeCenterY = (eyeTop.y + eyeBottom.y) / 2

  // PRIMARY: iris landmarks — these physically move with eye rotation
  if (landmarks.length > 473) {
    const iris_top = landmarks[LEFT_IRIS_TOP]
    const iris_bottom = landmarks[LEFT_IRIS_BOTTOM]
    const iris_left = landmarks[LEFT_IRIS_LEFT]
    const iris_right = landmarks[LEFT_IRIS_RIGHT]

    if (iris_top && iris_top.x > 0 && iris_top.x < 1 &&
        iris_bottom && iris_bottom.x > 0 && iris_bottom.x < 1 &&
        iris_left && iris_left.x > 0 && iris_left.x < 1 &&
        iris_right && iris_right.x > 0 && iris_right.x < 1) {

      const irisX = (iris_top.x + iris_bottom.x + iris_left.x + iris_right.x) / 4
      const irisY = (iris_top.y + iris_bottom.y + iris_left.y + iris_right.y) / 4

      // Return offset from eye center in eye-width units — this is the gaze direction signal
      return {
        x: (irisX - eyeCenterX) / eyeWidth,
        y: (irisY - eyeCenterY) / eyeWidth,
      }
    }
  }

  // FALLBACK: iris not available — no gaze direction info, return neutral
  return { x: 0, y: 0 }
}

/**
 * Calculate gaze deviation between iris direction and dot position.
 *
 * gazePosition: iris offset from eye center in eye-width units (from getGazePositionFromLandmarks)
 * dotPosition:  dot in container pixels
 * containerWidth/Height: dimensions of the container the dot moves within
 *
 * Coordinate notes:
 *  - Video is displayed CSS-mirrored (scale-x-[-1]), but MediaPipe sees the raw stream.
 *    When the dot is on the LEFT (small x), the user looks left → iris moves RIGHT in
 *    camera coords (larger x). We invert dot X to align both into the same direction space.
 *  - Iris typically travels ±0.4 eye-widths for full left/right screen-edge gaze.
 *    Dot direction is ±0.5 (half the container). We scale to match.
 */
export function calculateGazeDeviation(
  gazePosition: { x: number; y: number },
  dotPosition: { x: number; y: number },
  containerWidth: number,
  containerHeight: number
): number {
  // Dot as centered direction in [-0.5, +0.5]; invert X for mirror correction
  const dotDirX = -((dotPosition.x / containerWidth) - 0.5)
  const dotDirY = (dotPosition.y / containerHeight) - 0.5

  // Scale calibrated iris offset to the ±0.5 dot-direction range.
  // After calibration, the iris typically moves ±0.05–0.08 eye-widths for a
  // full screen sweep (head + eye combined), so scale ~8 maps that to ±0.5.
  const IRIS_SCALE = 8.0
  const irisScaledX = gazePosition.x * IRIS_SCALE
  const irisScaledY = gazePosition.y * IRIS_SCALE

  const dx = irisScaledX - dotDirX
  const dy = irisScaledY - dotDirY
  return Math.sqrt(dx * dx + dy * dy)
}

export async function detectFace(
  landmarker: Awaited<ReturnType<typeof createLandmarker>>,
  video: HTMLVideoElement,
  dotPosition: { x: number; y: number } | null,
  containerWidth: number,
  containerHeight: number
): Promise<FaceLandmarkerResult | null> {
  if (video.readyState < 2 || !dotPosition) {
    return null
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null
  }

  if (containerWidth <= 0 || containerHeight <= 0) {
    return null
  }

  const timestamp = performance.now()
  try {
    const result = landmarker.detectForVideo(video, timestamp)

    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null
    }

    const face = result.faceLandmarks[0]
    const gazePosition = getGazePositionFromLandmarks(face)
    const gazeDeviation = calculateGazeDeviation(
      gazePosition,
      dotPosition,
      containerWidth,
      containerHeight
    )

    return { gazeDeviation, gazePosition, timestamp }
  } catch (e) {
    console.error('[detectFace] Error:', e)
    return null
  }
}

/**
 * Computed ocular test metrics.
 */
export interface OcularTestMetrics {
  averageDeviation: number        // Mean gaze deviation across all frames
  maxDeviation: number            // Maximum gaze deviation 
  trackingFailures: number        // Count of frames where deviation > 0.08
  totalDuration: number           // Test duration in seconds
  framesPerSecond: number         // Average FPS achieved
  frameCount: number              // Total frames processed
}

/**
 * Compute comprehensive ocular test metrics from recorded deviations and test duration.
 * Threshold adjusted for realistic gaze tracking precision.
 */
export function computeOcularMetrics(
  deviations: number[],
  startTime: number,
  endTime: number
): OcularTestMetrics {
  const frameCount = deviations.length
  const totalDuration = (endTime - startTime) / 1000 // Convert ms to seconds
  const framesPerSecond = frameCount > 0 && totalDuration > 0 ? frameCount / totalDuration : 0
  
  let averageDeviation = 0
  let maxDeviation = 0
  let trackingFailures = 0
  
  if (frameCount > 0) {
    averageDeviation = deviations.reduce((sum, d) => sum + d, 0) / frameCount
    maxDeviation = Math.max(...deviations)
    // Threshold: 0.25 accounts for scale=8 amplification of small iris movements.
    // A deviation > 0.25 means the calibrated gaze direction missed the dot by
    // more than half of the expected tracking range — a clear tracking failure.
    trackingFailures = deviations.filter(d => d > 0.25).length
  }
  
  return {
    averageDeviation: Number(averageDeviation.toFixed(4)),
    maxDeviation: Number(maxDeviation.toFixed(4)),
    trackingFailures,
    totalDuration: Number(totalDuration.toFixed(2)),
    framesPerSecond: Number(framesPerSecond.toFixed(1)),
    frameCount,
  }
}
