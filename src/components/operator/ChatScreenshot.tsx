import { useState, useRef, useEffect } from 'react';
import { X, Download, ExternalLink, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatScreenshotProps {
  imageUrl: string;
  profileName?: string;
  timestamp?: Date;
  action?: string;
  className?: string;
}

export function ChatScreenshot({ 
  imageUrl, 
  profileName, 
  timestamp, 
  action,
  className 
}: ChatScreenshotProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; pinchDistance?: number; pinchScale?: number }>({ x: 0, y: 0 });
  const lastPosition = useRef({ x: 0, y: 0 });

  // Reset on close
  useEffect(() => {
    if (!isExpanded) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isExpanded]);

  // Handle keyboard
  useEffect(() => {
    if (!isExpanded) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.5, 5));
      if (e.key === '-') setScale(s => Math.max(s - 0.5, 0.5));
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }); }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `screenshot-${profileName || 'session'}-${Date.now()}.png`;
    link.click();
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(s => Math.min(s + 0.5, 5));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(s => Math.max(s - 0.5, 0.5));
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Touch/mouse drag handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStart.current = { x: clientX, y: clientY };
    lastPosition.current = { ...position };
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || scale <= 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setPosition({
      x: lastPosition.current.x + (clientX - dragStart.current.x),
      y: lastPosition.current.y + (clientY - dragStart.current.y)
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Pinch zoom for touch
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      // Store initial distance on first pinch
      if (!dragStart.current.pinchDistance) {
        (dragStart.current as any).pinchDistance = distance;
        (dragStart.current as any).pinchScale = scale;
      } else {
        const newScale = ((dragStart.current as any).pinchScale * distance) / (dragStart.current as any).pinchDistance;
        setScale(Math.max(0.5, Math.min(5, newScale)));
      }
    } else {
      handleDragMove(e);
    }
  };

  const handleTouchEnd = () => {
    (dragStart.current as any).pinchDistance = null;
    setIsDragging(false);
  };

  // Double tap to zoom
  const lastTap = useRef(0);
  const handleDoubleTap = (e: React.TouchEvent) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      e.preventDefault();
      if (scale > 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }
    lastTap.current = now;
  };

  return (
    <>
      {/* Inline Preview */}
      <div className={cn(
        "relative rounded-xl overflow-hidden bg-muted/30 border border-border/50",
        "max-w-sm",
        className
      )}>
        {/* Header */}
        {(profileName || action) && (
          <div className="px-3 py-2 bg-card/80 border-b border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium">{profileName || 'Agent'}</span>
              </div>
              {action && (
                <span className="text-[10px] text-muted-foreground">{action}</span>
              )}
            </div>
          </div>
        )}

        {/* Image */}
        <div 
          className="relative cursor-pointer group"
          onClick={() => setIsExpanded(true)}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img 
            src={imageUrl} 
            alt="Screenshot" 
            className="w-full h-auto max-h-48 object-contain"
            onLoad={() => setIsLoading(false)}
          />
          <div className="absolute inset-0 bg-background/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <ZoomIn className="w-6 h-6 text-foreground" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-card/50 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {timestamp ? new Date(timestamp).toLocaleTimeString('ru-RU') : 'Сейчас'}
          </span>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            >
              <Download className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
            >
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal - Mobile Optimized */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex flex-col touch-none"
          onClick={() => setIsExpanded(false)}
        >
          {/* Top Controls */}
          <div className="flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-sm font-medium">
                {profileName || 'Screenshot'}
              </span>
              <span className="text-white/50 text-xs">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-10 w-10"
              onClick={() => setIsExpanded(false)}
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
          
          {/* Image Container - Full Screen */}
          <div 
            className="flex-1 flex items-center justify-center overflow-hidden"
            onMouseDown={handleDragStart}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={(e) => { handleDoubleTap(e); handleDragStart(e); }}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={imageUrl} 
              alt="Screenshot Full" 
              className="max-w-full max-h-full object-contain select-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              draggable={false}
            />
          </div>
          
          {/* Bottom Controls */}
          <div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-center gap-3 mb-3">
              <Button 
                variant="secondary" 
                size="icon"
                className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border-0"
                onClick={handleZoomOut}
              >
                <ZoomOut className="w-5 h-5 text-white" />
              </Button>
              <Button 
                variant="secondary" 
                size="icon"
                className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border-0"
                onClick={handleReset}
              >
                <RotateCcw className="w-5 h-5 text-white" />
              </Button>
              <Button 
                variant="secondary" 
                size="icon"
                className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 border-0"
                onClick={handleZoomIn}
              >
                <ZoomIn className="w-5 h-5 text-white" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-white/10 hover:bg-white/20 text-white border-0"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Скачать
              </Button>
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-white/10 hover:bg-white/20 text-white border-0"
                onClick={(e) => { e.stopPropagation(); window.open(imageUrl, '_blank'); }}
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                Открыть
              </Button>
            </div>
            <p className="text-center text-white/40 text-xs mt-2">
              Двойной тап для зума • Свайп для перемещения
            </p>
          </div>
        </div>
      )}
    </>
  );
}
