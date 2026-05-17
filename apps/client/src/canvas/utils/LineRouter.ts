import type { Point, BoundingBox } from 'shared-types';

/**
 * LineRouter calculates the optimal connection paths between graphical entities.
 * It ensures lines anchor neatly to the bounding box perimeters rather than
 * penetrating into the center of shapes or text nodes.
 */
export const LineRouter = {
  /**
   * Calculates the exact center point of a given bounding box.
   */
  getCenter(box: BoundingBox): Point {
    return {
      x: box.minX + (box.maxX - box.minX) / 2,
      y: box.minY + (box.maxY - box.minY) / 2,
    };
  },

  /**
   * Finds the intersection point on the perimeter of a bounding box 
   * for a line drawn from its center toward an external target point.
   */
  getPerimeterIntersection(box: BoundingBox, target: Point): Point {
    const center = this.getCenter(box);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;

    // Handle edge case where boxes perfectly overlap
    if (dx === 0 && dy === 0) return { x: box.minX, y: box.minY };

    // Calculate how far we can move along the ray before hitting an edge
    const ratioX = width > 0 ? (width / 2) / Math.abs(dx) : Infinity;
    const ratioY = height > 0 ? (height / 2) / Math.abs(dy) : Infinity;
    
    // The actual intersection is the minimum of the X and Y bounds
    const intersectionRatio = Math.min(ratioX, ratioY);

    return {
      x: center.x + dx * intersectionRatio,
      y: center.y + dy * intersectionRatio,
    };
  },

  /**
   * Routes a direct, straight line between the closest perimeters of two bounding boxes.
   */
  routeStraight(startBox: BoundingBox, endBox: BoundingBox): Point[] {
    const startCenter = this.getCenter(startBox);
    const endCenter = this.getCenter(endBox);

    const p1 = this.getPerimeterIntersection(startBox, endCenter);
    const p2 = this.getPerimeterIntersection(endBox, startCenter);

    return [p1, p2];
  },

  /**
   * Routes an orthogonal (Manhattan) path consisting of horizontal and vertical segments.
   * Useful for flowchart-style diagramming.
   */
  routeOrthogonal(startBox: BoundingBox, endBox: BoundingBox): Point[] {
    const startCenter = this.getCenter(startBox);
    const endCenter = this.getCenter(endBox);

    // Get the perimeter anchor points
    const p1 = this.getPerimeterIntersection(startBox, endCenter);
    const p4 = this.getPerimeterIntersection(endBox, startCenter);

    // Calculate the midpoint for the elbow joint
    const midX = p1.x + (p4.x - p1.x) / 2;

    // Create a 3-segment Z-shape (or L-shape) orthogonal route
    const p2: Point = { x: midX, y: p1.y };
    const p3: Point = { x: midX, y: p4.y };

    return [p1, p2, p3, p4];
  },

  /**
   * Routes a smooth bezier curve. 
   * Returns control points that a Canvas/SVG engine can use for quadratic/cubic curves.
   */
  routeCurved(startBox: BoundingBox, endBox: BoundingBox): { 
    start: Point; 
    control1: Point; 
    control2: Point; 
    end: Point 
  } {
    const [start, end] = this.routeStraight(startBox, endBox);
    
    // Extend control points outward on the X-axis for a smooth horizontal S-curve
    const distance = Math.abs(end.x - start.x);
    const tension = 0.5; 
    const offset = distance * tension;

    return {
      start,
      control1: { x: start.x + offset, y: start.y },
      control2: { x: end.x - offset, y: end.y },
      end
    };
  }
};