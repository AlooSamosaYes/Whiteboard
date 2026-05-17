export type Point = {
  x: number;
  y: number;
  pressure?: number;
};

export type BoundingBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type BaseEntity = {
  id: string;
  type: 'stroke' | 'shape' | 'text' | 'connector';
  zIndex: number;
  createdAt: number;
  updatedAt: number;
};

export type StrokeEntity = BaseEntity & {
  type: 'stroke';
  points: Point[];
  color: string;
  brushSize: number;
  isEraser: boolean;
};

export type ShapeType = 'rectangle' | 'ellipse' | 'triangle' | 'diamond';

export type ShapeEntity = BaseEntity & {
  type: 'shape';
  shapeType: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
};

export type TextEntity = BaseEntity & {
  type: 'text';
  x: number;
  y: number;
  content: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  width: number;
  height: number;
  rotation: number;
};

export type ConnectorEntity = BaseEntity & {
  type: 'connector';
  startEntityId: string | null;
  endEntityId: string | null;
  startPoint: Point;
  endPoint: Point;
  color: string;
  strokeWidth: number;
  routingType: 'straight' | 'orthogonal' | 'curved';
};

export type CanvasEntity = StrokeEntity | ShapeEntity | TextEntity | ConnectorEntity;

export type WhiteboardPage = {
  id: string;
  title: string;
  orderIndex: number;
  entities: Record<string, CanvasEntity>;
  backgroundColor: string;
  createdAt: number;
  updatedAt: number;
};

export type WhiteboardDocument = {
  id: string;
  pages: Record<string, WhiteboardPage>;
  activePageId: string;
  metadata: DocumentMetadata;
};

export type DocumentMetadata = {
  title: string;
  ownerId: string;
  createdAt: number;
  lastModified: number;
};

export type CursorPresence = {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  lastUpdate: number;
};