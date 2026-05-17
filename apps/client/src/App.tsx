import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import * as Y from 'yjs';
import { CanvasEngine } from './canvas/CanvasEngine';
import { Toolbar } from './components/Toolbar';
import { DOMOverlay } from './canvas/DOMOverlay';
import type { Point, StrokeEntity, WhiteboardPage, CanvasEntity } from 'shared-types';

const createNewPage = (orderIndex: number): WhiteboardPage => ({
  id: crypto.randomUUID(),
  title: `Page ${orderIndex + 1}`,
  orderIndex,
  entities: {},
  backgroundColor: '#ffffff',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const App: React.FC = () => {
  // 1. Initialize Local Yjs CRDT Document
  const yDoc = useMemo(() => new Y.Doc(), []);
  const yPages = useMemo(() => yDoc.getMap<WhiteboardPage>('pages'), [yDoc]);
  const yPageOrder = useMemo(() => yDoc.getArray<string>('pageOrder'), [yDoc]);

  // React State bound to Yjs
  const [pages, setPages] = useState<WhiteboardPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Tool State
  const [activeColor, setActiveColor] = useState<string>('#000000');
  const [brushSize, setBrushSize] = useState<number>(4);
  const [isEraser, setIsEraser] = useState<boolean>(false);

  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);

  // 2. Bind Yjs Observers to React State
  useEffect(() => {
    const syncState = () => {
      const order = yPageOrder.toArray();
      const currentPages = order.map(id => yPages.get(id)).filter(Boolean) as WhiteboardPage[];
      setPages(currentPages);
    };

    yPages.observe(syncState);
    yPageOrder.observe(syncState);

    // Seed initial page if the Yjs document is empty
    if (yPageOrder.length === 0) {
      const initPage = createNewPage(0);
      yDoc.transact(() => {
        yPages.set(initPage.id, initPage);
        yPageOrder.push([initPage.id]);
      });
    } else {
      syncState();
    }

    return () => {
      yPages.unobserve(syncState);
      yPageOrder.unobserve(syncState);
    };
  }, [yDoc, yPages, yPageOrder]);

  const activePage = pages[activePageIndex] || pages[0];

  // Wipes and redraws the saved strokes when the page switches or new CRDT data arrives
  useEffect(() => {
    if (!activePage) return;
    const canvas = backgroundCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const entities = Object.values(activePage.entities);
    
    entities.forEach((entity) => {
      if (entity.type === 'stroke') {
        const stroke = entity as StrokeEntity;
        if (stroke.points.length === 0) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.isEraser ? activePage.backgroundColor : stroke.color;
        ctx.lineWidth = stroke.brushSize;
        ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    });

    ctx.globalCompositeOperation = 'source-over';
  }, [activePage]);

  // --- CRDT Mutators ---
  // Any change made here is committed to the Yjs doc, which automatically updates the React state above.

  const handleAddPage = useCallback(() => {
    const newPage = createNewPage(yPageOrder.length);
    yDoc.transact(() => {
      yPages.set(newPage.id, newPage);
      yPageOrder.push([newPage.id]);
    });
    setActivePageIndex(yPageOrder.length - 1);
  }, [yDoc, yPages, yPageOrder]);

  const handleNextPage = useCallback(() => {
    setActivePageIndex((prev) => Math.min(prev + 1, pages.length - 1));
    setSelectedEntityId(null);
  }, [pages.length]);

  const handlePrevPage = useCallback(() => {
    setActivePageIndex((prev) => Math.max(prev - 1, 0));
    setSelectedEntityId(null);
  }, []);

  const handleStrokeComplete = useCallback((strokeData: {
    points: Point[];
    color: string;
    brushSize: number;
    isEraser: boolean;
  }) => {
    if (!activePage) return;

    const newStroke: StrokeEntity = {
      id: crypto.randomUUID(),
      type: 'stroke',
      zIndex: Object.keys(activePage.entities).length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...strokeData,
    };

    const updatedPage = {
      ...activePage,
      entities: {
        ...activePage.entities,
        [newStroke.id]: newStroke,
      },
      updatedAt: Date.now()
    };

    yPages.set(activePage.id, updatedPage);
  }, [activePage, yPages]);

  const handleDeleteEntity = useCallback((id: string) => {
    if (!activePage) return;
    const newEntities = { ...activePage.entities };
    delete newEntities[id];
    
    yPages.set(activePage.id, {
      ...activePage,
      entities: newEntities,
      updatedAt: Date.now()
    });
    setSelectedEntityId(null);
  }, [activePage, yPages]);

  const handleUpdateText = useCallback((id: string, newContent: string) => {
    if (!activePage) return;
    const entity = activePage.entities[id];
    if (entity && entity.type === 'text') {
      const updatedEntity = { ...entity, content: newContent, updatedAt: Date.now() };
      yPages.set(activePage.id, {
        ...activePage,
        entities: { ...activePage.entities, [id]: updatedEntity },
        updatedAt: Date.now()
      });
    }
  }, [activePage, yPages]);

  const handleResizeEntity = useCallback((id: string, widthDelta: number, heightDelta: number) => {
    if (!activePage) return;
    const entity = activePage.entities[id];
    if (entity && (entity.type === 'shape' || entity.type === 'text')) {
      const updatedEntity = { 
        ...entity, 
        width: entity.width + widthDelta, 
        height: entity.height + heightDelta,
        updatedAt: Date.now() 
      };
      yPages.set(activePage.id, {
        ...activePage,
        entities: { ...activePage.entities, [id]: updatedEntity as CanvasEntity },
        updatedAt: Date.now()
      });
    }
  }, [activePage, yPages]);

  if (!activePage) return <div style={{ background: '#fff', width: '100vw', height: '100vh' }} />;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: activePage.backgroundColor }}>
      
      <canvas
        ref={backgroundCanvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }}
      />

      <CanvasEngine
        key={activePage.id} 
        width={window.innerWidth}
        height={window.innerHeight}
        activeColor={activeColor}
        brushSize={brushSize}
        isEraser={isEraser}
        onStrokeComplete={handleStrokeComplete}
      />

      <DOMOverlay
        entities={activePage.entities}
        selectedEntityId={selectedEntityId}
        onSelectEntity={setSelectedEntityId}
        onUpdateText={handleUpdateText}
        onDeleteEntity={handleDeleteEntity}
        onResizeEntity={handleResizeEntity}
      />
      
      <Toolbar
        currentPage={activePageIndex + 1}
        totalPages={pages.length}
        onAddPage={handleAddPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        activeColor={activeColor}
        onColorChange={setActiveColor}
        isEraser={isEraser}
        onToggleEraser={() => setIsEraser(!isEraser)}
      />
    </div>
  );
};

export default App;