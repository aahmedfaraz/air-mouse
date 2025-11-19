import { useEffect, useRef, useState } from 'react'
import './App.css'

import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handsRef = useRef<Hands | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

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
            // Subtle, less intense glow for the hand skeleton
            ctx.shadowColor = 'rgba(148, 163, 184, 0.4)' // slate-400
            ctx.shadowBlur = 6

            for (const landmarks of results.multiHandLandmarks) {
              drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                color: '#e5e7eb', // neutral-200 lines
                lineWidth: 2.2,
              })
              drawLandmarks(ctx, landmarks, {
                color: '#e5e7eb', // neutral-200 dots
                lineWidth: 1.1,
                radius: 3.2,
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
        <div className="bg-slate-900/80 backdrop-blur-xl text-center px-8 py-6 rounded-2xl shadow-2xl max-w-xl">
          <h1
            className="text-4xl sm:text-5xl font-extrabold bg-clip-text text-transparent mb-3 tracking-tight"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fb923c, #fbbf24, #f97316, #fb7185)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            AirMouse
          </h1>
          <p
            className="text-white text-base sm:text-lg mb-2"
            style={{ color: '#ffffff' }}
          >
            Control your cursor with just your hand — no physical mouse needed.
          </p>
          <p
            className="text-white text-sm sm:text-base mb-4"
            style={{ color: '#ffffff' }}
          >
            <span
              className="font-semibold text-white"
              style={{ color: '#ffffff' }}
            >
              Team Taurids
            </span>{' '}
            &mdash; Ahmed Faraz &amp; Abdullah Khetran
          </p>
          <p
            className="text-white text-xs sm:text-sm uppercase tracking-[0.2em]"
            style={{ color: '#ffffff' }}
          >
            AI Genesis Hackathon 2025 &bull; lablab.ai
          </p>
          {error && (
            <p className="mt-3 text-xs text-rose-300 font-medium">{error}</p>
          )}
        </div>
      </div>

      {/* Subtle gradient overlay for readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/45 to-slate-900/15" />
    </div>
  )
}

export default App
