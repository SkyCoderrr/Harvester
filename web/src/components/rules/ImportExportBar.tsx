import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { api, HarvesterClientError } from '../../api/client';
import type { RuleSet, RuleSetV1 } from '@shared/types';

// FR-V2-46 / FR-V2-47: export current rule-sets as canonical JSON + import
// a previously-saved JSON. Validation happens server-side; we just shape
// the upload into the same POST/PUT payload the form uses.

interface ExportShape {
  version: 2;
  exported_at: string;
  rules: Array<{ name: string; enabled: boolean; rules: RuleSetV1 }>;
}

export function ImportExportBar({ rules }: { rules: RuleSet[] }): JSX.Element {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function doExport(): void {
    const payload: ExportShape = {
      version: 2,
      exported_at: new Date().toISOString(),
      rules: rules.map((r) => ({ name: r.name, enabled: r.enabled, rules: r.rules })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `harvester-rules-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported ${payload.rules.length} rule-set(s).`);
  }

  async function doImport(file: File): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ExportShape> & {
        rules?: Array<{ name: string; enabled?: boolean; rules: RuleSetV1 }>;
      };
      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        throw new Error('Invalid file: missing top-level `rules` array.');
      }
      const existingByName = new Map(rules.map((r) => [r.name, r]));
      let created = 0;
      let updated = 0;
      for (const incoming of parsed.rules) {
        const body = {
          name: incoming.name,
          enabled: incoming.enabled ?? true,
          rules: incoming.rules,
        };
        const existing = existingByName.get(incoming.name);
        if (existing) {
          await api.put(`/api/rules/${existing.id}`, body);
          updated++;
        } else {
          await api.post('/api/rules', body);
          created++;
        }
      }
      await qc.invalidateQueries({ queryKey: ['rules'] });
      setStatus(`Imported ${created} new, ${updated} updated.`);
    } catch (err) {
      setStatus(
        err instanceof HarvesterClientError
          ? `Import failed: ${err.user_message}`
          : `Import failed: ${(err as Error).message}`,
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={doExport}
        disabled={rules.length === 0}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" /> Export JSON
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" /> Import JSON
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
        }}
      />
      {status && <span className="text-xs text-text-muted">{status}</span>}
    </div>
  );
}
