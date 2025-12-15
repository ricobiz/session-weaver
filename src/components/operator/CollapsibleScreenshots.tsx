import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Image, ExternalLink } from 'lucide-react';
import { ScreenshotAnnotator } from './ScreenshotAnnotator';

interface Screenshot {
  id: string;
  imageUrl: string;
  timestamp: Date;
  profileName?: string;
  actionName?: string;
}

interface Pin {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface CollapsibleScreenshotsProps {
  screenshots: Screenshot[];
  onAnnotationSend: (imageUrl: string, pins: Pin[], message: string) => void;
}

export function CollapsibleScreenshots({ screenshots, onAnnotationSend }: CollapsibleScreenshotsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  if (screenshots.length === 0) return null;

  const latestScreenshot = screenshots[0];
  const selectedImage = screenshots.find(s => s.id === selectedScreenshot);

  return (
    <>
      <div className="rounded-xl bg-muted/30 border border-border/30 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <Image className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Скриншоты</span>
          <span className="text-xs text-muted-foreground">({screenshots.length})</span>
          
          {/* Preview of latest */}
          {!isExpanded && latestScreenshot && (
            <div className="ml-auto flex items-center gap-2">
              <img 
                src={latestScreenshot.imageUrl} 
                alt="Latest" 
                className="w-8 h-8 rounded object-cover"
              />
              <span className="text-[10px] text-muted-foreground">
                {latestScreenshot.profileName || 'Последний'}
              </span>
            </div>
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="p-2 border-t border-border/20">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {screenshots.map((screenshot) => (
                <button
                  key={screenshot.id}
                  onClick={() => setSelectedScreenshot(screenshot.id)}
                  className="relative group rounded-lg overflow-hidden border border-border/30 hover:border-primary/50 transition-colors"
                >
                  <img 
                    src={screenshot.imageUrl} 
                    alt={screenshot.actionName || 'Screenshot'} 
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                    <ExternalLink className="w-4 h-4 text-white" />
                  </div>
                  {screenshot.profileName && (
                    <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/50 text-[8px] text-white truncate max-w-[80%]">
                      {screenshot.profileName}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Annotator dialog */}
      {selectedImage && (
        <ScreenshotAnnotator
          imageUrl={selectedImage.imageUrl}
          isOpen={!!selectedScreenshot}
          onClose={() => setSelectedScreenshot(null)}
          onSendAnnotation={onAnnotationSend}
        />
      )}
    </>
  );
}
