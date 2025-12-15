import { useState } from 'react';
import { X, Download, ExternalLink, ZoomIn } from 'lucide-react';
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

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `screenshot-${profileName || 'session'}-${Date.now()}.png`;
    link.click();
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
              onClick={handleDownload}
            >
              <Download className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={() => window.open(imageUrl, '_blank')}
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {isExpanded && (
        <div 
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-10"
            onClick={() => setIsExpanded(false)}
          >
            <X className="w-5 h-5" />
          </Button>
          
          <img 
            src={imageUrl} 
            alt="Screenshot Full" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-1.5" />
              Скачать
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => window.open(imageUrl, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-1.5" />
              Открыть
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
