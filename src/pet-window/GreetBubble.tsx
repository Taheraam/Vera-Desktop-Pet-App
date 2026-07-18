import { useEffect } from 'react';

interface GreetBubbleProps {
  message: string;
  visible: boolean;
  onAutoHide: () => void;
  durationMs: number;
}

export function GreetBubble({ message, visible, onAutoHide, durationMs }: GreetBubbleProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onAutoHide, durationMs);
    return () => clearTimeout(timer);
  }, [visible, onAutoHide, durationMs]);

  return (
    <div
      style={{
        position: 'absolute',
        top: -66,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 180,
        backgroundColor: '#faf7f2',
        border: '2px solid #e8765a',
        borderRadius: 10,
        padding: '8px 12px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: '#2a2a2a',
        lineHeight: 1.4,
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
        zIndex: 20,
      }}
    >
      {message}
      <div
        style={{
          position: 'absolute',
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid #e8765a',
        }}
      />
    </div>
  );
}
