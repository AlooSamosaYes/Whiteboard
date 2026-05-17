import React, { useRef, useEffect, useCallback } from 'react';
import type { Point } from 'shared-types';
import { OneEuroFilter } from './utils/InputSmoothing';

interface CanvasEngineProps {
  width: number;
  height: number;
  activeColor?: string;
  brushSize?: number;
  isEraser?: boolean;
  onStrokeComplete: (strokeData: {
    points: Point[];
    color: string;
    brushSize: number;
    isEraser: boolean;
  }) => void;
}

interface ActiveStroke {
  points: Point[];
  color: string;
  brushSize: number;
  isEraser: boolean;
  filter: OneEuroFilter;
}

const PALM_REJECTION_THRESHOLD = 30; // Maximum allowed contact geometry (width/height in pixels) for a valid pen/finger touch

export const CanvasEngine: React.FC<CanvasEngineProps> = ({
  width,
  height,
  activeColor = '#000000',
  brushSize = 4,
  isEraser = false,
  onStrokeComplete,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // Track multiple concurrent touches for multi-user smartboard support
  const activeStrokes = useRef<Map<number, ActiveStroke>>(new Map());

  // Initialize Canvas Context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Support high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d', {
      desynchronized: true, // Hint to browser for lower latency rendering
      willReadFrequently: false,
    });

    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      contextRef.current = ctx;
    }
  }, [width, height]);

  /**
   * Hardware-agnostic Palm Rejection
   * Analyzes the pointer event to determine if the input is a fine stylus/finger or a palm resting on the board.
   */
  const isValidTouch = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') return true;
    
    // For touch events, evaluate the contact area
    // 'width' and 'height' represent the contact geometry of the touch on the screen.
    const contactWidth = e.width || 0;
    const contactHeight = e.height || 0;

    // If the contact area is abnormally large, reject it as a palm
    if (contactWidth > PALM_REJECTION_THRESHOLD || contactHeight > PALM_REJECTION_THRESHOLD) {
      return false;
    }

    return true;
  }, []);

  const getCanvasCoordinates = useCallback((e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: e.clientX, y: e.clientY };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isValidTouch(e)) return;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.setPointerCapture(e.pointerId);
    }

    const { x, y } = getCanvasCoordinates(e);
    const pressure = e.pressure !== 0 ? e.pressure : 1.0;

    const filter = new OneEuroFilter(1.0, 0.05, 1.0);
    const smoothed = filter.filter(x, y, performance.now());

    const initialPoint: Point = { x: smoothed.x, y: smoothed.y, pressure };

    activeStrokes.current.set(e.pointerId, {
      points: [initialPoint],
      color: activeColor,
      brushSize: brushSize,
      isEraser: isEraser,
      filter: filter,
    });

    // Draw initial dot
    const ctx = contextRef.current;
    if (ctx) {
      ctx.beginPath();
      ctx.arc(smoothed.x, smoothed.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = isEraser ? '#FFFFFF' : activeColor; 
      ctx.fill();
    }
  }, [activeColor, brushSize, isEraser, isValidTouch, getCanvasCoordinates]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeData = activeStrokes.current.get(e.pointerId);
    if (!strokeData) return;

    // Re-evaluate palm rejection mid-stroke (e.g., resting palm after starting draw)
    if (!isValidTouch(e)) {
      activeStrokes.current.delete(e.pointerId);
      return;
    }

    // Use getCoalescedEvents for high-frequency polling hardware (like 120Hz+ smartboards)
    const events = (e.nativeEvent as any).getCoalescedEvents 
      ? (e.nativeEvent as any).getCoalescedEvents() 
      : [e.nativeEvent];

    const ctx = contextRef.current;
    if (!ctx) return;

    ctx.strokeStyle = strokeData.isEraser ? '#FFFFFF' : strokeData.color;
    ctx.lineWidth = strokeData.brushSize;

    // Use global composite operation to support erasing visually on the local canvas
    ctx.globalCompositeOperation = strokeData.isEraser ? 'destination-out' : 'source-over';

    for (const event of events) {
      const { x, y } = getCanvasCoordinates(event as any);
      const pressure = event.pressure !== 0 ? event.pressure : 1.0;
      
      const smoothed = strokeData.filter.filter(x, y, performance.now());
      const newPoint: Point = { x: smoothed.x, y: smoothed.y, pressure };

      const points = strokeData.points;
      const lastPoint = points[points.length - 1];

      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(newPoint.x, newPoint.y);
      ctx.stroke();

      points.push(newPoint);
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [isValidTouch, getCanvasCoordinates]);

  const handlePointerUpOrCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeData = activeStrokes.current.get(e.pointerId);
    if (!strokeData) return;

    activeStrokes.current.delete(e.pointerId);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }

    // Only commit if there's an actual line (more than just a single tap, or handle taps as dots)
    if (strokeData.points.length > 0) {
      onStrokeComplete({
        points: strokeData.points,
        color: strokeData.color,
        brushSize: strokeData.brushSize,
        isEraser: strokeData.isEraser,
      });
    }
  }, [onStrokeComplete]);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onPointerOut={handlePointerUpOrCancel}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        touchAction: 'none', // Prevents browser scrolling/zooming on the smartboard
        cursor: isEraser ? 'crosshair' : 'crosshair',
        zIndex: 10, // Sits above background, below DOM Overlay
      }}
    />
  );
};