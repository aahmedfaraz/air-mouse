import { useEffect, useRef, useState } from 'react'
import './App.css'

type GestureEvent =
  | 'Click'
  | 'Right click'
  | 'Mouse down (drag)'
  | 'Mouse up (drop)'
  | 'Scroll up'
  | 'Scroll down'

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handsRef = useRef<any | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const trackingActiveRef = useRef(false)
  const sensitivityRef = useRef(1) // 1 = default, higher = more sensitive

  const [error, setError] = useState<string | null>(null)
  const [isTrackingActive, setIsTrackingActive] = useState(false)
  const [lastGesture, setLastGesture] = useState<GestureEvent | null>(null)
  const [sensitivity, setSensitivity] = useState(1)
  const [isCameraMode, setIsCameraMode] = useState(false)

  useEffect(() => {
    let isCancelled = false

    // Track gesture sequences to toggle tracking (open/close hand 3 times)
    type HandState = 'open' | 'closed' | 'unknown'
    let lastHandState: HandState = 'unknown'
    let closeCount = 0
    let firstCloseTimestamp = 0

    // Track fine-grained gestures (click, right-click, drag, scroll)
    let wasPinched = false
    let pinchStartTime = 0
    let lastTapTime = 0
    let tapCount = 0
    let isDraggingGesture = false

    // Continuous gestures keep label while active (drag, scroll)
    let continuousGesture: GestureEvent | null = null
    let continuousGestureLastTime = 0

    // Timeout for transient gestures (click, right-click, drop)
    let transientTimeoutId: number | null = null

    const showTransientGesture = (label: GestureEvent) => {
      setLastGesture(label)
      if (transientTimeoutId !== null) {
        window.clearTimeout(transientTimeoutId)
      }
      transientTimeoutId = window.setTimeout(() => {
        // Only clear if no continuous gesture is currently active
        if (continuousGesture === null) {
          setLastGesture(null)
        }
        transientTimeoutId = null
      }, 800)
    }

    const classifyHandState = (
      landmarks: readonly { x: number; y: number; z: number }[],
    ): HandState => {
      if (!landmarks.length) return 'unknown'

      const wrist = landmarks[0]
      const tipIndices = [4, 8, 12, 16, 20]

      const distances = tipIndices.map((i) => {
        const tip = landmarks[i]
        const dx = tip.x - wrist.x
        const dy = tip.y - wrist.y
        return Math.hypot(dx, dy)
      })

      const avgDistance =
        distances.reduce((sum, d) => sum + d, 0) / distances.length

      // Heuristic threshold: larger average distance => fingers more extended
      return avgDistance > 0.18 ? 'open' : 'closed'
    }

    async function setupCameraAndHands() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        })

        if (!videoRef.current || !canvasRef.current || isCancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        videoRef.current.srcObject = stream
        await new Promise<void>((resolve) => {
          if (!videoRef.current) return resolve()
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play()
            resolve()
          }
        })

        // Ensure MediaPipe Hands and drawing utils scripts are loaded (globals)
        const ensureScript = (globalKey: string, src: string) =>
          new Promise<void>((resolve, reject) => {
            if ((window as any)[globalKey]) {
              resolve()
              return
            }

            const script = document.createElement('script')
            script.src = src
            script.async = true
            script.onload = () => resolve()
            script.onerror = () =>
              reject(new Error(`Failed to load script: ${src}`))
            document.body.appendChild(script)
          })

        await Promise.all([
          ensureScript(
            'Hands',
            'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
          ),
          ensureScript(
            'drawConnectors',
            'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
          ),
        ])

        const HandsCtor: any = (window as any).Hands
        const HAND_CONNECTIONS: any = (window as any).HAND_CONNECTIONS
        const drawConnectorsFn: any = (window as any).drawConnectors
        const drawLandmarksFn: any = (window as any).drawLandmarks

        const hands = new HandsCtor({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        })

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          selfieMode: true,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.7,
        })

        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')

        hands.onResults((results: any) => {
          if (!canvas || !ctx) return

          const videoWidth = results.image.width
          const videoHeight = results.image.height

          canvas.width = videoWidth
          canvas.height = videoHeight

          ctx.save()
          ctx.clearRect(0, 0, canvas.width, canvas.height)

          // Draw the camera feed
          ctx.globalAlpha = 0.6
          ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height)
          ctx.globalAlpha = 1

          // Add a dark overlay to make the video appear significantly darker
          ctx.fillStyle = 'rgba(15, 23, 42, 0.55)' // slate-900 with alpha
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          if (results.multiHandLandmarks && results.multiHandLandmarks.length) {
            const now = performance.now()

            // Use the first detected hand for toggle + gesture logic
            const primary = results.multiHandLandmarks[0]

            // ---- Tracking toggle (open/close 3x within 5s) ----
            const currentState = classifyHandState(primary)

            if (currentState === 'unknown') {
              lastHandState = 'unknown'
              closeCount = 0
              firstCloseTimestamp = 0
            } else {
              const MAX_SEQUENCE_MS = 3000

              // Detect open -> closed transitions
              if (lastHandState === 'open' && currentState === 'closed') {
                if (closeCount === 0 || now - firstCloseTimestamp > MAX_SEQUENCE_MS) {
                  // Start a new sequence
                  closeCount = 1
                  firstCloseTimestamp = now
                } else {
                  closeCount += 1
                }

                if (closeCount >= 3 && now - firstCloseTimestamp <= MAX_SEQUENCE_MS) {
                  setIsTrackingActive((prev) => {
                    const next = !prev
                    trackingActiveRef.current = next
                    if (!next) {
                      setLastGesture(null)
                    }
                    return next
                  })
                  // Reset sequence after a successful toggle
                  closeCount = 0
                  firstCloseTimestamp = 0
                }
              }

              lastHandState = currentState
            }

            // ---- Gesture events & cursor control (only when tracking is ON) ----
            if (trackingActiveRef.current) {
              const thumbTip = primary[4]
              const indexTip = primary[8]
              const wrist = primary[0]

              const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
                Math.hypot(a.x - b.x, a.y - b.y)

              const pinchDistance = dist(thumbTip, indexTip)

              // Sensitivity tuning: higher slider value => easier to trigger
              const rawSensitivity = sensitivityRef.current
              const sens = Math.min(1.5, Math.max(0.5, rawSensitivity))

              // Pinch threshold: larger with more sensitivity
              const PINCH_THRESHOLD = 0.045 + (sens - 1) * 0.02
              const isPinched = pinchDistance < PINCH_THRESHOLD

              const distToWrist = (i: number) => dist(primary[i], wrist)

              // Extension threshold: smaller with more sensitivity
              const EXT_THRESHOLD = 0.19 - (sens - 1) * 0.04

              const indexExtended = distToWrist(8) > EXT_THRESHOLD
              const middleExtended = distToWrist(12) > EXT_THRESHOLD
              const ringExtended = distToWrist(16) > EXT_THRESHOLD
              const pinkyExtended = distToWrist(20) > EXT_THRESHOLD

              const SHORT_TAP_MAX_MS = 250
              const DOUBLE_TAP_WINDOW_MS = 450
              const DRAG_HOLD_MS = 300

              // Map thumb tip to normalized screen coordinates and send to main
              // Use direct x so cursor moves in same left/right direction as thumb.
              const normalizedX = Math.min(Math.max(thumbTip.x, 0), 1)
              const normalizedY = Math.min(Math.max(thumbTip.y, 0), 1)
              window.ipcRenderer?.send('cursor:move', {
                x: normalizedX,
                y: normalizedY,
              })

              // Pinch start
              if (isPinched && !wasPinched) {
                wasPinched = true
                pinchStartTime = now
              }

              // Pinch end -> click / right-click / drop
              if (!isPinched && wasPinched) {
                const heldMs = now - pinchStartTime
                wasPinched = false

                if (heldMs >= DRAG_HOLD_MS && isDraggingGesture) {
                  // Mouse up after drag
                  showTransientGesture('Mouse up (drop)')
                  window.ipcRenderer?.send('cursor:mouseup', { button: 'left' })
                  isDraggingGesture = false
                  continuousGesture = null
                } else if (heldMs < SHORT_TAP_MAX_MS) {
                  // Quick tap(s) for click / right-click
                  if (now - lastTapTime < DOUBLE_TAP_WINDOW_MS) {
                    tapCount += 1
                  } else {
                    tapCount = 1
                  }
                  lastTapTime = now

                  if (tapCount === 2) {
                    showTransientGesture('Right click')
                    window.ipcRenderer?.send('cursor:click', { button: 'right' })
                    tapCount = 0
                  } else {
                    showTransientGesture('Click')
                    window.ipcRenderer?.send('cursor:click', { button: 'left' })
                  }
                }
              }

              // Drag start
              if (isPinched) {
                const heldMs = now - pinchStartTime
                if (!isDraggingGesture && heldMs >= DRAG_HOLD_MS) {
                  isDraggingGesture = true
                  continuousGesture = 'Mouse down (drag)'
                  continuousGestureLastTime = now
                  setLastGesture('Mouse down (drag)')
                  window.ipcRenderer?.send('cursor:mousedown', { button: 'left' })
                }
              }

              // Scroll gestures (only when not pinched)
              if (!isPinched) {
                const onlyIndexExtended =
                  indexExtended &&
                  !middleExtended &&
                  !ringExtended &&
                  !pinkyExtended

                const indexAndMiddleExtended =
                  indexExtended &&
                  middleExtended &&
                  !ringExtended &&
                  !pinkyExtended

                if (onlyIndexExtended) {
                  continuousGesture = 'Scroll up'
                  continuousGestureLastTime = now
                  setLastGesture('Scroll up')
                  window.ipcRenderer?.send('cursor:scroll', {
                    direction: 'up',
                    amount: 3,
                  })
                } else if (indexAndMiddleExtended) {
                  continuousGesture = 'Scroll down'
                  continuousGestureLastTime = now
                  setLastGesture('Scroll down')
                  window.ipcRenderer?.send('cursor:scroll', {
                    direction: 'down',
                    amount: 3,
                  })
                } else if (
                  continuousGesture === 'Scroll up' ||
                  continuousGesture === 'Scroll down'
                ) {
                  // Pose changed away from scroll; clear after short delay
                  if (now - continuousGestureLastTime > 200) {
                    continuousGesture = null
                    if (transientTimeoutId === null) {
                      setLastGesture(null)
                    }
                  }
                }
              }

              // Drag ended (no pinch, some time passed)
              if (
                continuousGesture === 'Mouse down (drag)' &&
                !isPinched &&
                now - continuousGestureLastTime > 200
              ) {
                continuousGesture = null
                if (transientTimeoutId === null) {
                  setLastGesture(null)
                }
              }
            }

            // Subtle, less intense glow for the hand skeleton
            ctx.shadowColor = 'rgba(148, 163, 184, 0.4)' // slate-400
            ctx.shadowBlur = 6

            const active = trackingActiveRef.current
            const lineColor = active ? '#f97316' : '#e5e7eb' // orange-500 vs neutral-200
            const dotColor = active ? '#fed7aa' : '#e5e7eb' // orange-200 vs neutral-200

            for (const landmarks of results.multiHandLandmarks) {
              drawConnectorsFn(ctx, landmarks, HAND_CONNECTIONS, {
                color: lineColor,
                lineWidth: active ? 2.6 : 2.1,
              })
              drawLandmarksFn(ctx, landmarks, {
                color: dotColor,
                lineWidth: active ? 1.3 : 1.0,
                radius: active ? 3.4 : 3.0,
              })
            }

            ctx.shadowBlur = 0
          }

          ctx.restore()
        })

        handsRef.current = hands

        const processFrame = async () => {
          if (
            isCancelled ||
            !handsRef.current ||
            !videoRef.current ||
            videoRef.current.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA
          ) {
            animationFrameRef.current = requestAnimationFrame(processFrame)
            return
          }

          await handsRef.current.send({ image: videoRef.current })
          animationFrameRef.current = requestAnimationFrame(processFrame)
        }

        animationFrameRef.current = requestAnimationFrame(processFrame)
      } catch (err) {
        console.error(err)
        let message = 'Unable to access camera. Please check permissions.'
        if (err instanceof DOMException) {
          if (err.name === 'NotReadableError' || err.message.includes('Device in use')) {
            message =
              'Camera is already in use by another app. Close any other AirMouse or camera apps and try again.'
          } else if (err.name === 'NotAllowedError') {
            message =
              'Camera access was blocked. Please allow camera access for AirMouse in system settings.'
          }
        }
        setError(message)
      }
    }

    setupCameraAndHands()

    return () => {
      isCancelled = true

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      if (handsRef.current) {
        handsRef.current.close()
      }

      if (videoRef.current?.srcObject instanceof MediaStream) {
        videoRef.current.srcObject
          .getTracks()
          .forEach((track) => track.stop())
      }
    }
  }, [])

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* Hidden video source for MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Canvas showing webcam + hand overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Camera mode toggle (top-right) */}
      <button
        type="button"
        className="camera-toggle"
        onClick={() => setIsCameraMode((prev) => !prev)}
      >
        {isCameraMode ? 'Show UI' : 'Camera mode'}
      </button>

      {/* Gesture help (top-left) */}
      {isTrackingActive && !isCameraMode && (
        <div className="gesture-help">
          <h2 className="gesture-help-title">Gesture controls</h2>
          <ul className="gesture-help-list">
            <li>
              <span className="label">Click</span>
              <span className="detail">
                Tap thumb &amp; index together once quickly
              </span>
            </li>
            <li>
              <span className="label">Right click</span>
              <span className="detail">
                Tap thumb &amp; index together twice quickly
              </span>
            </li>
            <li>
              <span className="label">Mouse down (drag)</span>
              <span className="detail">
                Keep thumb &amp; index pinched together
              </span>
            </li>
            <li>
              <span className="label">Mouse up (drop)</span>
              <span className="detail">
                Release the pinch after dragging
              </span>
            </li>
            <li>
              <span className="label">Scroll up</span>
              <span className="detail">
                Only index finger extended, others closed
              </span>
            </li>
            <li>
              <span className="label">Scroll down</span>
              <span className="detail">
                Index &amp; middle extended, others closed
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* Center content overlay */}
      {!isCameraMode && (
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <div className="hero-card">
            <h1 className="hero-title">AirMouse</h1>
            <p className="hero-subtitle">
              Control your cursor with just your hand — no physical mouse
              needed.
            </p>
            <p className="hero-team">
              <span>Team Taurids</span> —{' '}
              <button
                type="button"
                className="hero-link"
                onClick={() =>
                  window.ipcRenderer?.send(
                    'open-external',
                    'https://www.linkedin.com/in/aahmedfaraz/',
                  )
                }
              >
                Ahmed Faraz
              </button>{' '}
              &amp;{' '}
              <button
                type="button"
                className="hero-link"
                onClick={() =>
                  window.ipcRenderer?.send(
                    'open-external',
                    'https://www.linkedin.com/in/abdullah-khetran/',
                  )
                }
              >
                Abdullah Khetran
              </button>
            </p>
            <p className="hero-tagline">
              AI Genesis Hackathon 2025 • lablab.ai
            </p>

            <div className="hero-status">
              <span
                className={`hero-status-pill ${
                  isTrackingActive
                    ? 'hero-status-pill--active'
                    : 'hero-status-pill--idle'
                }`}
              >
                <span
                  className={`hero-status-dot ${
                    isTrackingActive ? 'hero-status-dot--active' : ''
                  }`}
                />
                {isTrackingActive ? 'Tracking enabled' : 'Tracking paused'}
              </span>
              <p className="hero-status-instruction">
                Open and close your hand{' '}
                <span className="highlight">3 times</span> in front of the
                camera to toggle{' '}
                <span className="app-name">AirMouse tracking</span> on or off.
              </p>
            </div>

            <div className="sensitivity-control">
              <span className="sensitivity-label">Gesture sensitivity</span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={sensitivity}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  setSensitivity(value)
                  sensitivityRef.current = value
                }}
              />
              <span className="sensitivity-value">
                {sensitivity.toFixed(1)}x
              </span>
            </div>

            {error && <p className="hero-error">{error}</p>}
          </div>
        </div>
      )}

      {/* Global gesture indicator (shown in both normal + camera modes) */}
      <div
        className={`gesture-indicator ${
          lastGesture ? 'gesture-indicator--visible' : 'gesture-indicator--hidden'
        }`}
      >
        <span className="gesture-indicator-value">
          {lastGesture ?? '\u00A0'}
        </span>
      </div>

      {/* Subtle gradient overlay for readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 to-slate-900/15" />
    </div>
  )
}

export default App
