import { useEffect, useRef, useState } from 'react'
import './App.css'

import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handsRef = useRef<Hands | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const trackingActiveRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [isTrackingActive, setIsTrackingActive] = useState(false)

  useEffect(() => {
    let isCancelled = false

    // Track gesture sequences to toggle tracking (open/close hand 3 times)
    type HandState = 'open' | 'closed' | 'unknown'
    let lastHandState: HandState = 'unknown'
    let closeCount = 0
    let lastGestureTimestamp = 0

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

        const hands = new Hands({
          locateFile: (file) =>
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

        hands.onResults((results) => {
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
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)' // slate-900 with alpha
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          if (results.multiHandLandmarks && results.multiHandLandmarks.length) {
            const now = performance.now()

            // Use the first detected hand for gesture toggling
            const primary = results.multiHandLandmarks[0]
            const currentState = classifyHandState(primary)

            if (currentState === 'unknown') {
              lastHandState = 'unknown'
              closeCount = 0
            } else {
              const MAX_SEQUENCE_MS = 5000

              if (now - lastGestureTimestamp > MAX_SEQUENCE_MS) {
                closeCount = 0
              }

              // Count a "close" gesture that follows an "open" one
              if (lastHandState === 'open' && currentState === 'closed') {
                closeCount += 1
                lastGestureTimestamp = now

                if (closeCount >= 3) {
                  setIsTrackingActive((prev) => {
                    const next = !prev
                    trackingActiveRef.current = next
                    return next
                  })
                  closeCount = 0
                }
              }

              lastHandState = currentState
            }

            // Subtle, less intense glow for the hand skeleton
            ctx.shadowColor = 'rgba(148, 163, 184, 0.4)' // slate-400
            ctx.shadowBlur = 6

            const active = trackingActiveRef.current
            const lineColor = active ? '#f97316' : '#e5e7eb' // orange-500 vs neutral-200
            const dotColor = active ? '#fed7aa' : '#e5e7eb' // orange-200 vs neutral-200

            for (const landmarks of results.multiHandLandmarks) {
              drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                color: lineColor,
                lineWidth: active ? 2.6 : 2.1,
              })
              drawLandmarks(ctx, landmarks, {
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
        setError('Unable to access camera. Please check permissions.')
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

      {/* Center content overlay */}
      <div className="relative z-10 flex items-center justify-center min-h-screen pointer-events-none px-4">
        <div className="hero-card">
          <h1 className="hero-title">AirMouse</h1>
          <p className="hero-subtitle">
            Control your cursor with just your hand — no physical mouse needed.
          </p>
          <p className="hero-team">
            <span>Team Taurids</span> — Ahmed Faraz &amp; Abdullah Khetran
          </p>
          <p className="hero-tagline">AI Genesis Hackathon 2025 • lablab.ai</p>

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
              <span className="highlight">3 times</span> in front of the camera
              to toggle <span className="app-name">AirMouse tracking</span> on
              or off.
            </p>
          </div>

          {error && <p className="hero-error">{error}</p>}
        </div>
      </div>

      {/* Subtle gradient overlay for readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 to-slate-900/15" />
    </div>
  )
}

export default App
