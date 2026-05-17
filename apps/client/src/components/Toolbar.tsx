import React from 'react';

interface ToolbarProps {
  currentPage: number;
  totalPages: number;
  onAddPage: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  isEraser: boolean;
  onToggleEraser: () => void;
}

const COLORS = ['#000000', '#FF3B30', '#4CD964', '#007AFF', '#FFCC00'];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  totalPages,
  onAddPage,
  onNextPage,
  onPrevPage,
  activeColor,
  onColorChange,
  isEraser,
  onToggleEraser,
}) => {
  return (
    <div style={{
      position: 'absolute',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '24px',
      padding: '16px 32px',
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      zIndex: 100, // Sits above the Canvas and DOM Overlay
      alignItems: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      userSelect: 'none' // Prevent accidental text selection on smartboard
    }}>
      
      {/* Pagination Controls */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        borderRight: '2px solid #f0f0f0', 
        paddingRight: '24px' 
      }}>
        <button 
          onClick={onPrevPage} 
          disabled={currentPage === 1}
          style={{ 
            padding: '10px 16px', 
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            border: '1px solid #ddd',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
            fontSize: '16px'
          }}
        >
          Prev
        </button>
        <span style={{ fontSize: '18px', fontWeight: '600', minWidth: '100px', textAlign: 'center' }}>
          Page {currentPage} / {totalPages}
        </span>
        <button 
          onClick={onNextPage} 
          disabled={currentPage === totalPages}
          style={{ 
            padding: '10px 16px', 
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            border: '1px solid #ddd',
            borderRadius: '8px',
            backgroundColor: '#f9f9f9',
            fontSize: '16px'
          }}
        >
          Next
        </button>
        <button 
          onClick={onAddPage}
          style={{ 
            marginLeft: '8px',
            padding: '10px 16px', 
            backgroundColor: '#e3f2fd', 
            color: '#1565c0',
            border: 'none', 
            borderRadius: '8px', 
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '600'
          }}
        >
          + Add Page
        </button>
      </div>

      {/* Drawing Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => {
              if (isEraser) onToggleEraser();
              onColorChange(color);
            }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: color,
              border: activeColor === color && !isEraser ? '4px solid #b0bec5' : '2px solid #fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              transform: activeColor === color && !isEraser ? 'scale(1.15)' : 'scale(1)',
              transition: 'all 0.15s ease-in-out'
            }}
            aria-label={`Select color ${color}`}
          />
        ))}
        
        <button
          onClick={onToggleEraser}
          style={{
            marginLeft: '16px',
            padding: '10px 24px',
            backgroundColor: isEraser ? '#ffebee' : '#ffffff',
            color: isEraser ? '#c62828' : '#333',
            border: isEraser ? '2px solid #ef5350' : '2px solid #e0e0e0',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: isEraser ? '700' : '500',
            transition: 'all 0.15s ease-in-out'
          }}
        >
          Eraser
        </button>
      </div>
    </div>
  );
};