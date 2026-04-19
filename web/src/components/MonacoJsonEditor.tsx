import { useCallback, useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import rulesSchema from '@shared/rules-schema.json';

/**
 * Monaco JSON editor pre-configured with the RuleSetInput schema (generated from Zod).
 * Uses the shared schema so inline validation + autocomplete mirror the server.
 */
export default function MonacoJsonEditor({
  value,
  onChange,
  readOnly,
  height = 320,
}: {
  value: string;
  onChange(next: string): void;
  readOnly?: boolean;
  height?: number;
}): JSX.Element {
  const registered = useRef(false);

  const onMount: OnMount = useCallback((_editor, monaco) => {
    if (registered.current) return;
    registered.current = true;
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [
        {
          uri: 'inmemory://harvester/rules-schema.json',
          fileMatch: ['*'],
          schema: rulesSchema as unknown as object,
        },
      ],
    });
  }, []);

  useEffect(() => () => undefined, []);

  return (
    <div className="border border-zinc-800 rounded overflow-hidden">
      <Editor
        value={value}
        defaultLanguage="json"
        theme="vs-dark"
        height={height}
        onMount={onMount}
        onChange={(v) => onChange(v ?? '')}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          lineNumbers: 'on',
          folding: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          formatOnPaste: true,
          formatOnType: true,
          renderLineHighlight: 'line',
          roundedSelection: false,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
