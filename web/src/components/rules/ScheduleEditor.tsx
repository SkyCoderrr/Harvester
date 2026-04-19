import { Plus, Trash2 } from 'lucide-react';
import type { ScheduleSpec } from '@shared/types';

// FR-V2-41 / FR-V2-42: UI over the existing ScheduleSpec shape already
// consumed by isScheduleActive. Backend is unchanged.
//
// Model:
//  - `null` schedule  = always active (no gating)
//  - object schedule  = active only during the listed windows
//
// Each window has a set of weekdays + start/end "HH:MM". Midnight wrap is
// handled by the evaluator; we just display it as-is.

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];

export interface ScheduleEditorProps {
  value: ScheduleSpec | null;
  onChange: (next: ScheduleSpec | null) => void;
}

export function ScheduleEditor({ value, onChange }: ScheduleEditorProps): JSX.Element {
  const active = value != null;
  const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function enable(): void {
    onChange({
      timezone: 'system',
      windows: [{ days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00' }],
    });
  }

  function setSchedule(next: ScheduleSpec): void {
    onChange(next);
  }

  function addWindow(): void {
    if (!value) return;
    setSchedule({
      ...value,
      windows: [...value.windows, { days: [...DAYS], start: '00:00', end: '23:59' }],
    });
  }

  function removeWindow(idx: number): void {
    if (!value) return;
    const windows = value.windows.filter((_, i) => i !== idx);
    if (windows.length === 0) {
      onChange(null);
    } else {
      setSchedule({ ...value, windows });
    }
  }

  function patchWindow(idx: number, patch: Partial<ScheduleSpec['windows'][number]>): void {
    if (!value) return;
    setSchedule({
      ...value,
      windows: value.windows.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    });
  }

  function toggleDay(idx: number, day: Day): void {
    if (!value) return;
    const w = value.windows[idx];
    if (!w) return;
    const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day];
    patchWindow(idx, { days });
  }

  if (!active) {
    return (
      <div>
        <button
          type="button"
          onClick={enable}
          className="text-xs px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded hover:bg-zinc-800 cursor-pointer"
        >
          Add a schedule
        </button>
        <span className="ml-2 text-xs text-text-muted">
          (currently: always active)
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <label>
            Timezone:
            <select
              value={value.timezone}
              onChange={(e) => setSchedule({ ...value, timezone: e.target.value })}
              className="ml-1.5 px-2 py-1 bg-bg-elev border border-zinc-800 rounded font-mono"
            >
              <option value="system">system ({systemTz})</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Taipei">Asia/Taipei</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/London">Europe/London</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-text-muted hover:text-accent-danger cursor-pointer"
        >
          Remove schedule (always active)
        </button>
      </div>

      {value.windows.map((w, idx) => (
        <WindowRow
          key={idx}
          window={w}
          onChange={(patch) => patchWindow(idx, patch)}
          onRemove={() => removeWindow(idx)}
          onToggleDay={(d) => toggleDay(idx, d)}
        />
      ))}

      <button
        type="button"
        onClick={addWindow}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-bg-elev border border-zinc-800 rounded hover:bg-zinc-800 cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> Add another window
      </button>
    </div>
  );
}

function WindowRow({
  window: w,
  onChange,
  onRemove,
  onToggleDay,
}: {
  window: ScheduleSpec['windows'][number];
  onChange: (patch: Partial<ScheduleSpec['windows'][number]>) => void;
  onRemove: () => void;
  onToggleDay: (d: Day) => void;
}): JSX.Element {
  return (
    <div className="border border-zinc-800 rounded p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => {
          const on = w.days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggleDay(d)}
              className={`text-[11px] uppercase font-mono px-2 py-1 rounded border cursor-pointer ${
                on
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-zinc-800 text-text-muted hover:text-text-primary'
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <label className="text-text-muted">
          Start
          <input
            type="time"
            value={w.start}
            onChange={(e) => onChange({ start: e.target.value })}
            className="ml-1.5 px-2 py-1 bg-bg-elev border border-zinc-800 rounded font-mono"
          />
        </label>
        <label className="text-text-muted">
          End
          <input
            type="time"
            value={w.end}
            onChange={(e) => onChange({ end: e.target.value })}
            className="ml-1.5 px-2 py-1 bg-bg-elev border border-zinc-800 rounded font-mono"
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove window"
          className="ml-auto h-7 w-7 flex items-center justify-center rounded text-text-muted hover:text-accent-danger hover:bg-accent-danger/10 cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

