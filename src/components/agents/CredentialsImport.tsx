import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ParsedCredential {
  email: string;
  password: string;
  valid: boolean;
  error?: string;
}

interface CredentialsImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (credentials: { email: string; password: string }[]) => void;
}

// Парсер для разных форматов credentials
function parseCredentials(input: string): ParsedCredential[] {
  const lines = input.split('\n').filter(line => line.trim());
  const results: ParsedCredential[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    let email = '';
    let password = '';
    
    // Формат: email:password
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      email = parts[0].trim();
      password = parts.slice(1).join(':').trim(); // пароль может содержать :
    }
    // Формат: email password (пробел)
    else if (trimmed.includes(' ')) {
      const parts = trimmed.split(/\s+/);
      email = parts[0].trim();
      password = parts.slice(1).join(' ').trim();
    }
    // Формат: email;password
    else if (trimmed.includes(';')) {
      const parts = trimmed.split(';');
      email = parts[0].trim();
      password = parts.slice(1).join(';').trim();
    }
    // Формат: email|password
    else if (trimmed.includes('|')) {
      const parts = trimmed.split('|');
      email = parts[0].trim();
      password = parts.slice(1).join('|').trim();
    }
    // Формат: email,password
    else if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      email = parts[0].trim();
      password = parts.slice(1).join(',').trim();
    }
    
    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = emailRegex.test(email) && password.length > 0;
    
    results.push({
      email,
      password,
      valid,
      error: !valid ? (
        !emailRegex.test(email) ? 'Неверный email' : 'Пустой пароль'
      ) : undefined
    });
  }
  
  return results;
}

export function CredentialsImport({ open, onOpenChange, onImport }: CredentialsImportProps) {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<ParsedCredential[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  
  const handleParse = () => {
    const results = parseCredentials(input);
    setParsed(results);
  };
  
  const validCount = parsed.filter(p => p.valid).length;
  const invalidCount = parsed.filter(p => !p.valid).length;
  
  const handleImport = async () => {
    setIsImporting(true);
    const validCredentials = parsed
      .filter(p => p.valid)
      .map(({ email, password }) => ({ email, password }));
    
    await onImport(validCredentials);
    setIsImporting(false);
    setInput('');
    setParsed([]);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Импорт учётных данных
          </DialogTitle>
          <DialogDescription>
            Вставьте список email:password в любом формате (разделители: : ; | , пробел)
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Textarea
            placeholder={`Примеры форматов:
user@mail.com:password123
user2@mail.com;mypass
user3@mail.com|secret
user4@mail.com password`}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
          />
          
          <div className="flex items-center gap-2">
            <Button onClick={handleParse} variant="secondary" size="sm">
              Распарсить
            </Button>
            {parsed.length > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-500/10 text-green-500">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validCount} валидных
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {invalidCount} ошибок
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          {parsed.length > 0 && (
            <ScrollArea className="h-[200px] border rounded-md p-2">
              <div className="space-y-1">
                {parsed.map((cred, i) => (
                  <div 
                    key={i} 
                    className={`flex items-center gap-2 text-sm p-1.5 rounded ${
                      cred.valid ? 'bg-green-500/5' : 'bg-destructive/5'
                    }`}
                  >
                    {cred.valid ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                    )}
                    <span className="font-mono truncate">{cred.email}</span>
                    <span className="text-muted-foreground">:</span>
                    <span className="font-mono text-muted-foreground truncate">
                      {'•'.repeat(Math.min(cred.password.length, 8))}
                    </span>
                    {cred.error && (
                      <span className="text-destructive text-xs ml-auto">{cred.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={validCount === 0 || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Создание агентов...
              </>
            ) : (
              <>Импортировать {validCount} агентов</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
