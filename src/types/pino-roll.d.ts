declare module 'pino-roll' {
  interface PinoRollOptions {
    file: string;
    frequency?: 'daily' | 'hourly' | number;
    size?: string | number;
    limit?: { count?: number; size?: string };
    mkdir?: boolean;
  }
  function pinoRoll(opts: PinoRollOptions): Promise<NodeJS.WritableStream>;
  export default pinoRoll;
}
