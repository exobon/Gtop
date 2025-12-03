/**
 * STREAM COMMAND BACKEND
 * 
 * This server handles the heavy lifting:
 * 1. Managing Xvfb (Virtual Display)
 * 2. Launching Puppeteer (Chrome)
 * 3. Spawning FFmpeg to capture screen and stream to RTMP
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Global process references
let streamProcess = null;
let xvfbProcess = null;
let browserProcess = null; 
let lastStreamError = null; // Stores the specific reason why the stream failed

// Configuration constants
const DISPLAY_NUM = ':99';
const SCREEN_RES = '1920x1080';
const HTML_FILE_PATH = path.join(__dirname, 'public', 'live-overlay.html');

// Ensure public directory exists
if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'));
}

// --- HELPER FUNCTIONS ---

const killProcess = (pid) => {
    try {
        if (pid) process.kill(pid, 'SIGKILL');
    } catch (e) {
        // Process likely already dead, ignore
    }
};

const cleanup = async () => {
    console.log('Running cleanup sequence...');
    
    // 1. Kill FFmpeg
    if (streamProcess) {
        console.log(`Killing FFmpeg (PID: ${streamProcess.pid})`);
        killProcess(streamProcess.pid);
        streamProcess = null;
    }

    // 2. Close Browser
    if (browserProcess) {
       try {
           console.log('Closing Puppeteer browser...');
           await browserProcess.close();
       } catch(e) { 
           console.error("Error closing browser:", e.message); 
       }
       browserProcess = null;
    }

    // 3. Kill Xvfb
    if (xvfbProcess) {
        console.log(`Killing Xvfb (PID: ${xvfbProcess.pid})`);
        killProcess(xvfbProcess.pid);
        xvfbProcess = null;
    }

    // Double tap: kill any stray Xvfb on :99 just in case
    exec(`pkill -f "Xvfb ${DISPLAY_NUM}"`, (err) => {
        if (!err) console.log('Force cleaned Xvfb display.');
    });
    
    console.log('Cleanup complete.');
};

// --- ROUTES ---

app.get('/api/status', (req, res) => {
    res.json({ 
        active: !!streamProcess,
        error: lastStreamError 
    });
});

app.post('/api/start', async (req, res) => {
    if (streamProcess) {
        return res.status(400).json({ message: 'Stream is already running' });
    }

    const { streamKey, htmlContent } = req.body;

    if (!streamKey || !htmlContent) {
        return res.status(400).json({ message: 'Missing streamKey or htmlContent' });
    }

    // Reset error state
    lastStreamError = null;

    try {
        // 1. Save HTML to disk
        fs.writeFileSync(HTML_FILE_PATH, htmlContent);
        console.log('HTML content saved to disk.');

        // 2. Start Xvfb (Virtual Framebuffer)
        console.log(`Starting Xvfb on ${DISPLAY_NUM}...`);
        xvfbProcess = spawn('Xvfb', [DISPLAY_NUM, '-screen', '0', `${SCREEN_RES}x24`, '-ac']);
        
        // Give Xvfb a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Launch Puppeteer
        console.log('Launching Puppeteer...');
        const puppeteer = require('puppeteer');
        
        browserProcess = await puppeteer.launch({
            headless: false, // Must be false to render to Xvfb
            executablePath: process.env.CHROME_BIN || null, // Auto-detect or use env
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--display=${DISPLAY_NUM}`,
                '--start-fullscreen',
                '--window-size=1920,1080',
                '--autoplay-policy=no-user-gesture-required',
                '--hide-scrollbars'
            ]
        });

        const page = await browserProcess.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(`file://${HTML_FILE_PATH}`);
        
        // Hide cursor
        await page.evaluate(() => {
            document.body.style.cursor = 'none';
            document.body.style.overflow = 'hidden';
        });

        console.log('Page loaded successfully.');

        // 4. Start FFmpeg
        console.log('Starting FFmpeg stream...');
        
        // Construct RTMP URL
        const rtmpUrl = streamKey.startsWith('rtmp') 
            ? streamKey 
            : `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;

        const ffmpegArgs = [
            '-f', 'x11grab',             // Input format: X11
            '-draw_mouse', '0',          // Don't capture mouse
            '-s', SCREEN_RES,            // Resolution
            '-framerate', '30',          // FPS
            '-i', `${DISPLAY_NUM}.0`,    // Input source (Xvfb display)
            
            // Audio input (Silence generator)
            '-f', 'lavfi', 
            '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            
            // Video Codec (x264)
            '-c:v', 'libx264',
            '-preset', 'veryfast',       // CPU usage vs Quality trade-off
            '-maxrate', '3000k',         // Bitrate control
            '-bufsize', '6000k',
            '-pix_fmt', 'yuv420p',       // Required for YouTube
            '-g', '60',                  // Keyframe interval (2 seconds at 30fps)
            
            // Audio Codec
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            
            // Output
            '-f', 'flv',
            rtmpUrl
        ];

        streamProcess = spawn('ffmpeg', ffmpegArgs);

        // Robust Logging & Error Handling
        streamProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // console.log(`FFmpeg: ${output}`); // Uncomment for full verbosity

            // Detect critical errors that require a restart/cleanup
            const criticalErrors = [
                'Authentication failed',
                'Connection refused',
                'Server error',
                'Input/output error',
                'Already publishing'
            ];

            const foundError = criticalErrors.find(err => output.includes(err));

            if (foundError) {
                console.error(`[CRITICAL] FFmpeg Error Detected: ${foundError}`);
                lastStreamError = `Stream failed: ${foundError}`;
                // Trigger cleanup immediately
                cleanup();
            }
        });

        streamProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            if (code !== 0 && !lastStreamError) {
                lastStreamError = `FFmpeg exited unexpectedly with code ${code}`;
            }
            cleanup();
        });

        res.json({ message: 'Stream started successfully' });

    } catch (error) {
        console.error('Start Error:', error);
        lastStreamError = error.message;
        await cleanup();
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/stop', async (req, res) => {
    await cleanup();
    res.json({ message: 'Stream stopped' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});