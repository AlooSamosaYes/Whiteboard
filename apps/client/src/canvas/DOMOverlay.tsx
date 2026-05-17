import React, { useState, useRef } from 'react';
import type { 
  CanvasEntity, 
  Point, 
  BoundingBox, 
  TextEntity, 
  StrokeEntity 
} from 'shared-types';

/**
 * --- Math & Collision Utilities ---
 * Provides the mathematical foundation for calculating bounding boxes,
 * scaling transformations, and performing intersection tests for object erasing.
 */
export const domMathUtils = {
  // Calculates the shortest distance between a point (eraser) and a line segment (stroke segment)
  distanceToSegment(p: Point, v: Point, w: Point): number {
    const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
    if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
    
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    
    const projection = { 
      x: v.x + t * (w.x - v.x), 
      y: v.y + t * (w.y - v.y) 
    };
    
    return Math.sqrt(Math.pow(p.x - projection.x, 2) + Math.pow(p.y - projection.y, 2));
  },

  // Determines if an eraser stroke intersects with a recorded stroke entity
  checkStrokeEraserCollision(eraserPoint: Point, stroke: StrokeEntity, eraserRadius: number): boolean {
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const dist = this.distanceToSegment(eraserPoint, stroke.points[i], stroke.points[i + 1]);
      if (dist <= eraserRadius + (stroke.brushSize / 2)) {
        return true;
      }
    }
    return false;
  },

  // Generates precise bounding geometry for selection outlines
  getBoundingBox(entity: CanvasEntity): BoundingBox {
    switch (entity.type) {
      case 'stroke': {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of entity.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const pad = entity.brushSize / 2;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }
      case 'shape':
      case 'text':
        return {
          minX: entity.x,
          minY: entity.y,
          maxX: entity.x + entity.width,
          maxY: entity.y + entity.height
        };
      case 'connector':
        return {
          minX: Math.min(entity.startPoint.x, entity.endPoint.x),
          minY: Math.min(entity.startPoint.y, entity.endPoint.y),
          maxX: Math.max(entity.startPoint.x, entity.endPoint.x),
          maxY: Math.max(entity.startPoint.y, entity.endPoint.y)
        };
    }
  }
};

interface DOMOverlayProps {
  entities: Record<string, CanvasEntity>;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  onUpdateText: (id: string, newContent: string) => void;
  onDeleteEntity: (id: string) => void;
  onResizeEntity: (id: string, widthDelta: number, heightDelta: number) => void;
}

export const DOMOverlay: React.FC<DOMOverlayProps> = ({
  entities,
  selectedEntityId,
  onSelectEntity,
  onUpdateText,
  onDeleteEntity,
  onResizeEntity
}) => {
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [localTextValue, setLocalTextValue] = useState<string>('');
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleTextDoubleClick = (entity: TextEntity) => {
    setEditingTextId(entity.id);
    setLocalTextValue(entity.content);
    onSelectEntity(entity.id);
  };

  const renderSelectionBox = (entity: CanvasEntity) => {
    if (entity.id !== selectedEntityId || editingTextId === entity.id) return null;

    const box = domMathUtils.getBoundingBox(entity);
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;

    // Add slight padding to the bounding box so it doesn't clip the edges of strokes
    const padding = 8;

    return (
      <div
        key={`selection-${entity.id}`}
        style={{
          position: 'absolute',
          left: box.minX - padding,
          top: box.minY - padding,
          width: width + (padding * 2),
          height: height + (padding * 2),
          border: '2px solid #007AFF',
          pointerEvents: 'none', // Allow clicks to pass through to the element below
          zIndex: 50,
        }}
      >
        {/* Scale Adjustment Node (Bottom Right) */}
        <div
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 14,
            height: 14,
            backgroundColor: '#ffffff',
            border: '2px solid #007AFF',
            borderRadius: '50%',
            pointerEvents: 'auto',
            cursor: 'nwse-resize',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeEntity(entity.id, 20, 20); 
          }}
        />
        
        {/* Quick Delete Node (Top Right) */}
        <div
          style={{
            position: 'absolute',
            right: -14,
            top: -14,
            width: 24,
            height: 24,
            backgroundColor: '#FF3B30',
            color: '#FFFFFF',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteEntity(entity.id);
          }}
        >
          ×
        </div>
      </div>
    );
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 20, 
        pointerEvents: 'none', /* FIXED: This allows clicks to pass through to the canvas */
        overflow: 'hidden'
      }}
    >
      {Object.values(entities).map(entity => {
        if (entity.type === 'text') {
          const textEntity = entity as TextEntity;
          const isEditing = editingTextId === entity.id;

          return (
            <React.Fragment key={entity.id}>
              <div
                style={{
                  position: 'absolute',
                  left: textEntity.x,
                  top: textEntity.y,
                  transform: `rotate(${textEntity.rotation}deg)`,
                  transformOrigin: 'top left',
                  cursor: isEditing ? 'text' : 'pointer',
                  zIndex: 30,
                  pointerEvents: 'auto', /* ADDED: This ensures the text elements remain clickable */
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!isEditing) onSelectEntity(entity.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleTextDoubleClick(textEntity);
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={localTextValue}
                    onChange={(e) => setLocalTextValue(e.target.value)}
                    onBlur={() => {
                      onUpdateText(entity.id, localTextValue);
                      setEditingTextId(null);
                    }}
                    style={{
                      fontSize: `${textEntity.fontSize}px`,
                      fontFamily: textEntity.fontFamily,
                      color: textEntity.color,
                      background: 'rgba(255, 255, 255, 0.9)',
                      border: '2px dashed #007AFF',
                      borderRadius: '4px',
                      outline: 'none',
                      minWidth: '150px',
                      minHeight: '40px',
                      resize: 'none',
                      overflow: 'hidden',
                      whiteSpace: 'pre-wrap',
                      padding: '4px',
                      margin: '-6px' 
                    }}
                  />
                ) : (
                  <div style={{
                    fontSize: `${textEntity.fontSize}px`,
                    fontFamily: textEntity.fontFamily,
                    color: textEntity.color,
                    whiteSpace: 'pre-wrap',
                    userSelect: 'none',
                    pointerEvents: 'none' 
                  }}>
                    {textEntity.content || 'Double click to edit text'}
                  </div>
                )}
              </div>
              {renderSelectionBox(entity)}
            </React.Fragment>
          );
        }

        return renderSelectionBox(entity);
      })}
    </div>
  );
};