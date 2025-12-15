import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Send, MapPin, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface Pin {
  id: string;
  x: number; // percentage
  y: number; // percentage
  label: string;
}

interface ScreenshotAnnotatorProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onSendAnnotation: (imageUrl: string, pins: Pin[], message: string) => void;
}

export function ScreenshotAnnotator({ 
  imageUrl, 
  isOpen, 
  onClose, 
  onSendAnnotation 
}: ScreenshotAnnotatorProps) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPins([]);
      setSelectedPin(null);
      setMessage('');
      setZoom(1);
    }
  }, [isOpen]);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const newPin: Pin = {
      id: Date.now().toString(),
      x,
      y,
      label: `#${pins.length + 1}`,
    };
    
    setPins([...pins, newPin]);
    setSelectedPin(newPin.id);
  };

  const updatePinLabel = (id: string, label: string) => {
    setPins(pins.map(p => p.id === id ? { ...p, label } : p));
  };

  const removePin = (id: string) => {
    setPins(pins.filter(p => p.id !== id));
    if (selectedPin === id) setSelectedPin(null);
  };

  const handleSend = () => {
    onSendAnnotation(imageUrl, pins, message);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] h-auto p-0 gap-0 bg-background/95 backdrop-blur-xl border-border/50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Аннотации ({pins.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="h-7 w-7 p-0"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              className="h-7 w-7 p-0"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0 ml-2">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Image Area */}
        <div className="flex-1 overflow-auto p-4 min-h-0 flex items-center justify-center">
          <div 
            ref={imageRef}
            className="relative cursor-crosshair"
            onClick={handleImageClick}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <img 
              src={imageUrl} 
              alt="Screenshot" 
              className="max-w-full max-h-[60vh] rounded-lg shadow-lg object-contain"
              draggable={false}
            />
            
            {/* Pins overlay */}
            {pins.map((pin) => (
              <div
                key={pin.id}
                className={`absolute transform -translate-x-1/2 -translate-y-full cursor-pointer transition-all ${
                  selectedPin === pin.id ? 'scale-125 z-20' : 'z-10'
                }`}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPin(pin.id);
                }}
              >
                <div className={`flex flex-col items-center ${selectedPin === pin.id ? 'animate-pulse' : ''}`}>
                  <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold mb-0.5 whitespace-nowrap max-w-[80px] truncate ${
                    selectedPin === pin.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-destructive text-destructive-foreground'
                  }`}>
                    {pin.label}
                  </div>
                  <div className={`w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent ${
                    selectedPin === pin.id ? 'border-t-primary' : 'border-t-destructive'
                  }`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pins List & Input */}
        <div className="border-t border-border/30 p-3 space-y-2">
          {/* Pins list */}
          {pins.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {pins.map((pin) => (
                <div 
                  key={pin.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                    selectedPin === pin.id 
                      ? 'bg-primary/20 border border-primary/40' 
                      : 'bg-muted/50 border border-border/30'
                  }`}
                >
                  <Input
                    value={pin.label}
                    onChange={(e) => updatePinLabel(pin.id, e.target.value)}
                    className="h-5 w-16 text-xs px-1 bg-transparent border-0 focus-visible:ring-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPin(pin.id);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePin(pin.id)}
                    className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Message input */}
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Комментарий к скриншоту (опционально)..."
              className="flex-1 h-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button 
              onClick={handleSend}
              disabled={pins.length === 0 && !message.trim()}
              className="h-9 px-4 btn-gradient"
            >
              <Send className="w-4 h-4 mr-1" />
              Отправить
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Кликните на изображение чтобы добавить пин
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
