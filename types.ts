export interface StreamStatus {
  active: boolean;
  pid?: number;
  uptime?: number;
  cpu?: number;
  memory?: number;
  error?: string | null;
}

export interface StreamConfig {
  streamKey: string;
  htmlContent: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
}

export enum StreamAction {
  START = 'START',
  STOP = 'STOP'
}