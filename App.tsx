import React, { useState, useEffect, useRef } from 'react';
import { Activity, Power, Upload, Terminal, Settings, Server, Play, Square, Wifi, WifiOff } from 'lucide-react';
import { Button } from './components/Button';
import { StatusBadge } from './components/StatusBadge';
import { StreamStatus, LogEntry } from './types';

// NOTE: In a real production build, these API calls would hit your Node.js backend.
// Ensure the backend server is running on port 3001 (or configure proxy).
const API_URL = 'http://localhost:3001/api';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; background: #000; color: white; display: flex; align-items: center; justify-center: center; height: 100vh; font-family: sans-serif; }
    h1 { font-size: 5rem; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
  </style>
</head>
<body>
  <h1>STREAMING LIVE</h1>
  <script>
    // Add any dynamic JS here (clocks, tickers, etc.)
  </script>
</body>
</html>`;

export default function App() {
  const [streamKey, setStreamKey] = useState('');
  const [htmlContent, setHtmlContent] = useState(DEFAULT_HTML);
  const [status, setStatus] = useState<StreamStatus>({ active: false });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [serverConnected, setServerConnected] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const lastLoggedErrorRef = useRef<string | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setLogs(prev => [...prev.slice(-100), entry]);
  };

  // Poll status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        if (!res.ok) throw new Error('Failed to fetch status');
        const data: StreamStatus = await res.json();
        setStatus(data);
        
        // Handle backend errors reported by the server
        if (data.error && data.error !== lastLoggedErrorRef.current) {
          addLog(`Backend Error: ${data.error}`, 'error');
          lastLoggedErrorRef.current = data.error;
        }
        
        // Reset error tracker if active (implies a successful restart)
        if (data.active) {
            lastLoggedErrorRef.current = null;
        }

        setServerConnected(true);
      } catch (err) {
        setServerConnected(false);
        // Don't log spam on poll failure, just update UI state
      }
    };

    const interval = setInterval(checkStatus, 3000);
    checkStatus(); // Initial check
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStartStream = async () => {
    if (!streamKey) {
      addLog('Stream Key is missing!', 'error');
      return;
    }

    setIsLoading(true);
    addLog('Initializing stream sequence...', 'info');

    try {
      const res = await fetch(`${API_URL}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamKey, htmlContent })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to start stream');
      }

      addLog('Stream started successfully. Warming up engines...', 'success');
      setStatus(prev => ({ ...prev, active: true }));
    } catch (error: any) {
      addLog(`Error starting stream: ${error.message}`, 'error');
      // For demo purposes if backend is missing
      if (!serverConnected) {
         addLog('DEMO MODE: Backend not detected. Please run the server/server.js script.', 'warning');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopStream = async () => {
    setIsLoading(true);
    addLog('Stopping stream processes...', 'warning');

    try {
      const res = await fetch(`${API_URL}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to stop stream');
      
      addLog('Stream stopped. Processes killed.', 'success');
      setStatus({ active: false });
    } catch (error: any) {
      addLog(`Error stopping stream: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">StreamCommand</h1>
              <p className="text-gray-500 text-sm">VPS Automation Control Panel</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className={`flex items-center gap-2 text-sm ${serverConnected ? 'text-gray-500' : 'text-red-500'}`}>
                {serverConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {serverConnected ? 'Server Connected' : 'Backend Disconnected'}
             </div>
             <StatusBadge active={status.active} />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Controls */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Configuration Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50 flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-200">Configuration</h2>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    YouTube Stream Key / RTMP URL
                  </label>
                  <input
                    type="password"
                    value={streamKey}
                    onChange={(e) => setStreamKey(e.target.value)}
                    placeholder="rtmp://a.rtmp.youtube.com/live2/xxxx-xxxx-xxxx-xxxx"
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Never share your stream key. This is sent securely to your VPS backend.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-400">
                      HTML Overlay Content
                    </label>
                    <span className="text-xs text-gray-500 font-mono">index.html</span>
                  </div>
                  <div className="relative">
                    <textarea
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      className="w-full h-64 bg-gray-950 border border-gray-800 rounded-lg p-4 text-gray-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                      spellCheck={false}
                    />
                    <div className="absolute bottom-4 right-4 text-xs text-gray-600 bg-gray-900 px-2 py-1 rounded border border-gray-800">
                      {(new Blob([htmlContent]).size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="primary" 
                className="w-full h-14 text-lg" 
                onClick={handleStartStream}
                disabled={status.active}
                isLoading={isLoading && !status.active}
              >
                <Play className="w-5 h-5 fill-current" />
                Start Stream
              </Button>
              
              <Button 
                variant="danger" 
                className="w-full h-14 text-lg"
                onClick={handleStopStream}
                disabled={!status.active}
                isLoading={isLoading && status.active}
              >
                <Square className="w-5 h-5 fill-current" />
                Stop Stream
              </Button>
            </div>
          </div>

          {/* Sidebar Info & Logs */}
          <div className="space-y-6">
            
            {/* Server Stats (Mock) */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
               <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50 flex items-center gap-2">
                <Server className="w-4 h-4 text-gray-400" />
                <h2 className="font-semibold text-gray-200">System Status</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Process Status</span>
                  <span className={`text-sm font-mono ${status.active ? 'text-green-400' : 'text-gray-500'}`}>
                    {status.active ? 'RUNNING' : 'IDLE'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Display</span>
                  <span className="text-sm font-mono text-gray-300">:99 (Xvfb)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Resolution</span>
                  <span className="text-sm font-mono text-gray-300">1920x1080</span>
                </div>
                 <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">FPS Target</span>
                  <span className="text-sm font-mono text-gray-300">30</span>
                </div>
              </div>
            </div>

            {/* Console Log */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col h-[400px]">
              <div className="px-6 py-4 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-gray-400" />
                  <h2 className="font-semibold text-gray-200">Event Log</h2>
                </div>
                <button 
                  onClick={() => setLogs([])}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-2 bg-black/50 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
                {logs.length === 0 && (
                  <div className="text-gray-600 italic text-center mt-10">No events logged yet...</div>
                )}
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                    <span className={`break-all ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}