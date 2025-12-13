import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type ExportType = 'sessions' | 'session_logs' | 'profiles' | 'scenarios' | 'runner_health';

export function DataExport() {
  const [exportType, setExportType] = useState<ExportType>('sessions');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const { data, error } = await supabase.functions.invoke('session-api', {
        method: 'POST',
        body: {
          _path: `/export?type=${exportType}${fromDate ? `&from=${fromDate}` : ''}${toDate ? `&to=${toDate}` : ''}`,
          _method: 'GET',
        },
      });

      // Fallback to direct query if edge function doesn't support this
      let exportData = data?.data;
      
      if (!exportData) {
        let query = supabase.from(exportType).select('*');
        if (fromDate) query = query.gte('created_at', fromDate);
        if (toDate) query = query.lte('created_at', toDate);
        
        const result = await query.limit(5000);
        if (result.error) throw result.error;
        exportData = result.data;
      }

      if (!exportData || exportData.length === 0) {
        toast({
          title: 'No Data',
          description: 'No data found for the selected criteria.',
          variant: 'destructive',
        });
        return;
      }

      let content: string;
      let mimeType: string;
      let extension: string;

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else {
        // Convert to CSV
        const headers = Object.keys(exportData[0]);
        const csvRows = [
          headers.join(','),
          ...exportData.map((row: Record<string, unknown>) =>
            headers.map((h) => {
              const value = row[h];
              if (value === null || value === undefined) return '';
              if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
              if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return String(value);
            }).join(',')
          ),
        ];
        content = csvRows.join('\n');
        mimeType = 'text/csv';
        extension = 'csv';
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}_export_${new Date().toISOString().split('T')[0]}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: `Exported ${exportData.length} records as ${format.toUpperCase()}.`,
      });

    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" />
          Export Data
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Data Type</Label>
            <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
              <SelectTrigger className="bg-muted/50 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sessions">Sessions</SelectItem>
                <SelectItem value="session_logs">Logs</SelectItem>
                <SelectItem value="profiles">Profiles</SelectItem>
                <SelectItem value="scenarios">Scenarios</SelectItem>
                <SelectItem value="runner_health">Runner Health</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as 'json' | 'csv')}>
              <SelectTrigger className="bg-muted/50 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="w-3.5 h-3.5" />
                    JSON
                  </div>
                </SelectItem>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    CSV
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-muted/50 h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-muted/50 h-9"
            />
          </div>
        </div>

        <Button 
          onClick={handleExport} 
          disabled={isExporting}
          className="w-full"
          size="sm"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Export {exportType}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
