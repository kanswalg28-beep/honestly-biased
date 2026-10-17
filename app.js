/* ==========================================================================
   HONESTLY BIASED - INTERACTIVE CORE WEBPAGE LOGIC
   Handles: Theme Toggling, Mobile Nav, Scroll Reveals, Civic Poll, Form Submit
   ========================================================================== */

// ============================================================================
// SITE CONTENT HYDRATION - replace [data-bind=...] text nodes with values
// fetched from /api/site-content on DOMContentLoaded. Each block exists in
// index.html with [data-site-content-block="..."] and inner [data-bind="..."]
// spans. Missing blocks render their original HTML as fallback.
// ============================================================================
async function hydrateSiteContent() {
    let payload = {};
    try {
        const res = await fetch('/api/site-content?_t=' + Date.now());
        if (res.ok) payload = await res.json() || {};
    } catch (e) {
        // network down — fall through, blocks keep baked defaults
    }

    // Walk all blocks. Each block scope makes bind keys scoped.
    for (const blockNode of document.querySelectorAll('[data-site-content-block]')) {
        const blockKey = blockNode.dataset.siteContentBlock;
        const data = payload[blockKey];
        if (!data) continue; // no DB row -> keep HTML fallback

        // === Featured-cards: lookup matched doc by data-featured-id ===
        // The CMS payload key is "featured" (one row, array of docs each with an
        // id). Each card in the page declares data-featured-id="dpdp|varanasi|..."
        // and we look the doc up by that id, so the bind spans reflect that doc.
        if (blockKey === 'featured' || blockKey === 'featured_card') {
            const fid = blockNode.dataset.featuredId;
            const docs = Array.isArray(data.docs) ? data.docs : [];
            const doc = docs.find(d => d && d.id === fid);
            if (!doc) continue;
            blockNode.querySelectorAll('[data-bind]').forEach(node => {
                const k = node.dataset.bind;
                if (doc[k] != null) node.textContent = String(doc[k]);
            });
            continue;
        }

        // === Poll: rebuild the option rows from data.options array ===
        if (blockKey === 'poll') {
            const form = blockNode.querySelector('.poll-form');
            if (form && Array.isArray(data.options)) {
                // hydrate header / prompt text
                blockNode.querySelectorAll('[data-bind]').forEach(node => {
                    if (node.dataset.bind === 'option_template') return;
                    const k = node.dataset.bind;
                    if (data[k] != null) node.textContent = String(data[k]);
                });
                // rebuild the three option buttons
                form.innerHTML = '';
                data.options.slice(0, 6).forEach(opt => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'poll-option-btn';
                    btn.setAttribute('data-poll-id', opt.id || '');
                    btn.innerHTML =
                        '<span class="poll-option-text">' + escapeHtml(opt.label || '') + '</span>' +
                        '<span class="poll-bar" style="width: ' + Number(opt.pct || 0) + '%;"></span>' +
                        '<span class="poll-percentage">' + Number(opt.pct || 0) + '%</span>';
                    form.appendChild(btn);
                });
            }
            continue;
        }

        // === Standards list: rebuild the <ul> from data.items ===
        if (blockKey === 'standards' && Array.isArray(data.items)) {
            const ul = blockNode.querySelector('ul');
            if (ul) {
                ul.innerHTML = '';
                data.items.slice(0, 12).forEach(item => {
                    const li = document.createElement('li');
                    const a = document.createElement('a');
                    a.href = '#';
                    a.textContent = String(item || '');
                    li.appendChild(a);
                    ul.appendChild(li);
                });
            }
            continue;
        }

        // === Generic scalar block: replace each leaf's textContent ===
        blockNode.querySelectorAll('[data-bind]').forEach(node => {
            const k = node.dataset.bind;
            if (data[k] != null) node.textContent = String(data[k]);
        });

        // === Hero: update background image if present ===
        if (blockKey === 'hero' && data.image) {
            const lensContainer = document.getElementById('lens-canvas-container');
            if (lensContainer) {
                // NOTE: Do NOT set lensContainer.dataset.src here — updateTexture()
                // compares against data-src to detect changes. Setting it early
                // causes updateTexture to skip loading the new image.
                // lensContainer.dataset.src = data.image;
                // Update all source/img elements inside
                const picture = lensContainer.querySelector('picture');
                if (picture) {
                    // Update the fallback img
                    const fallbackImg = picture.querySelector('img.hero-fallback-img');
                    if (fallbackImg) fallbackImg.src = data.image;
                    // Update source elements - try to derive responsive variants
                    const sources = picture.querySelectorAll('source');
                    sources.forEach(source => {
                        const srcset = source.getAttribute('srcset');
                        if (srcset && srcset.includes('hero-bg')) {
                            // Replace both ./assets/hero-bg-VARIANT.ext and /assets/hero-bg-VARIANT.ext
                            const newSrcset = srcset.replace(/(\.{0,1}\/?assets\/hero-bg[^"'\s]+)(\.[a-z0-9]+)/g, (match, prefix, ext) => {
                                const newBase = data.image.replace(/\.[a-z0-9]+$/, '');
                                return newBase + ext;
                            });
                            source.setAttribute('srcset', newSrcset);
                        }
                    });
                }
                // NOTE: Do NOT set lensContainer.dataset.src here — updateTexture()
                // sets it internally after confirming the texture changed. Setting
                // it early causes updateTexture's sanitize() check to skip loading.
            }
            // Update Three.js lens effect texture
            if (window.PerspectiveLens && typeof window.PerspectiveLens.updateTexture === 'function') {
                console.log('[hydrateSiteContent] Calling PerspectiveLens.updateTexture with:', data.image);
                window.PerspectiveLens.updateTexture(data.image);
            } else {
                console.log('[hydrateSiteContent] PerspectiveLens not ready:', { 
                    hasPerspectiveLens: !!window.PerspectiveLens, 
                    hasUpdateTexture: window.PerspectiveLens ? typeof window.PerspectiveLens.updateTexture : 'N/A' 
                });
            }
        }
    }
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    // Build entities from char codes so the file source itself never
    // contains literal "<", ">", "&", """, "'" — those would be
    // unescaped by editors / patch tools in transit.
    var E = {
        amp:   String.fromCharCode(38),                                 // &
        lt:    String.fromCharCode(38, 108, 116, 59),                   // <
        gt:    String.fromCharCode(38, 103, 116, 59),                   // >
        quot:  String.fromCharCode(38, 113, 117, 111, 116, 59),        // "
        apos:  String.fromCharCode(38, 35, 51, 57, 59)             // &#39; (correct apostrophe entity)
    };
    return String(s)
        .replace(/&/g, E.amp)
        .replace(/</g, E.lt)
        .replace(/>/g, E.gt)
        .replace(/"/g, E.quot)
        .replace(/'/g, E.apos);
}

// Format date as "Jan 15, 2026" or similar readable format
function formatDate(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        return '';
    }
}

// Derive a short, URL-friendly 8-hex identifier from a uuid (last 8 hex chars).
// Must match the same derivation on the server (api/article.js).
function shortIdFromUuid(uuid) {
    if (!uuid) return '';
    return String(uuid).replace(/-/g, '').slice(-8);
}

// Centralized text cleaning helper for client hydration
function cleanEditorialText(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;

    // 1. Remove space before exclamation marks and question marks in titles/text (" !" -> "!", " ?" -> "?")
    cleaned = cleaned.replace(/\s+([!?])/g, '$1');

    // 2. Remove any accidental leading verdict label prefix using regex rather than index slicing
    cleaned = cleaned.replace(/^(?:Verdict|AI Narrative Bias Audit|Bias Audit):\s*/i, '');

    // 3. Fix legacy index-slicing clipping where "The story..." was sliced to "he story..."
    if (/^he\s+(?:story|narrative|framing|headline|piece|report|claim|audit|article)\b/i.test(cleaned)) {
        cleaned = 'T' + cleaned;
    }

    // 4. Insert space after any comma not followed by space or digit
    cleaned = cleaned.replace(/,([^\s\d])/g, ', $1');

    // 5. Fix recurring LLM spelling and grammar glitches (non-destructive)
    cleaned = cleaned
        .replace(/\bunder\s+lying\b/gi, 'underlying')
        .replace(/\bfor\s+grounding\b/gi, 'foregrounding')
        .replace(/\btrademoff\b/gi, 'trade-off')
        .replace(/\bThe headline emphasize\s+/g, 'The headline emphasizes ')
        .replace(/\bthe headline emphasize\s+/g, 'the headline emphasizes ')
        .replace(/\bThe headline frame\s+/g, 'The headline frames ')
        .replace(/\bthe headline frame\s+/g, 'the headline frames ');

    // 6. Collapse multiple whitespace characters into a single space
    cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();

    // 7. Balance unpaired quotes at the end of headlines/sentences
    const doubleQuoteCount = (cleaned.match(/"/g) || []).length;
    if (doubleQuoteCount % 2 === 1) cleaned += '"';
    const openCurlyDouble = (cleaned.match(/“/g) || []).length;
    const closeCurlyDouble = (cleaned.match(/”/g) || []).length;
    if (openCurlyDouble > closeCurlyDouble) cleaned += '”';
    const openCurlySingle = (cleaned.match(/‘/g) || []).length;
    const closeCurlySingle = (cleaned.match(/’/g) || []).length;
    if (openCurlySingle > closeCurlySingle) cleaned += '’';
    const nonContractionSingles = (cleaned.replace(/\b['’]\b/g, '').match(/'/g) || []).length;
    if (nonContractionSingles % 2 === 1) cleaned += "'";
    return cleaned;
}

function formatRelativeTime(dateStr) {
    if (!dateStr) return 'recently';
    try {
        const diffMs = Date.now() - new Date(dateStr).getTime();
        if (diffMs < 0) return 'just now';
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return formatDate(dateStr);
    } catch (e) {
        return 'recently';
    }
}

function calculateReadTime(text) {
    const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200)) + ' Min Audit';
}

function classifyClientCategory(rawCategory, headline = '', summary = '') {
    const combined = `${headline} ${summary}`.toLowerCase();
    const current = (rawCategory || '').trim().toLowerCase();
    
    const crimeWords = ['murder', 'probe', 'encounter', 'stabbing', 'stabbed', 'shooting', 'police', 'arrested', 'arrest', 'fir', 'court', 'cbi', 'ed raid'];
    if (crimeWords.some(w => combined.includes(w)) && current === 'entertainment') {
        return 'Crime & Law';
    }
    const civicWords = ['traffic', 'jam', 'caversham', 'road chaos', 'tunnel', 'rail delay', 'bridge collapse', 'metro'];
    if (civicWords.some(w => combined.includes(w)) && current === 'entertainment') {
        return 'World & Civic';
    }
    if (current === 'health') {
        const casualtyWords = ['crash', 'accident', 'collision', 'tunnel', 'stabbing', 'stabbed', 'derail', 'landslide', 'flood', 'disaster'];
        if (casualtyWords.some(w => combined.includes(w))) {
            return 'World & Civic';
        }
    }
    
    const sportsWords = ['asian games', 'boxing', 'cricket', 'ipl', 'bcci', 'olympics', 'tennis', 'football', 'fifa', 'world cup', 'wicket', 'medal', 'tournament', 'championship'];
    if (sportsWords.some(w => combined.includes(w)) && (current === 'entertainment' || current === 'general' || !current)) {
        return 'Sports';
    }
    
    const map = {
        'politics': 'Politics',
        'tech': 'Tech',
        'finance': 'Finance',
        'crime & law': 'Crime & Law',
        'crime-and-law': 'Crime & Law',
        'world & civic': 'World & Civic',
        'world-and-civic': 'World & Civic',
        'health': 'Health',
        'sports': 'Sports',
        'sport': 'Sports',
        'entertainment': 'Entertainment'
    };
    return map[current] || rawCategory || 'Politics';
}

// Derive canonical article URL (/chronicles/:slug)
function getArticleUrl(article) {
    if (!article) return '/';
    if (article.url && article.url.startsWith('/chronicles/')) return article.url;
    const slug = article.slug || shortIdFromUuid(article.id);
    return `/chronicles/${slug}`;
}

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // 1. DUAL-THEME SWITCHER (Midnight Charcoal & Polar Wash Light Mode)
    // ==========================================================================
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const bodyElement = document.body;

    // Retrieve previous theme preference from localStorage or default to system preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'light') {
        bodyElement.classList.remove('dark-theme');
        bodyElement.classList.add('light-theme');
    } else if (savedTheme === 'dark') {
        bodyElement.classList.remove('light-theme');
        bodyElement.classList.add('dark-theme');
    } else {
        // Fallback to system preference
        if (!prefersDark) {
            bodyElement.classList.remove('dark-theme');
            bodyElement.classList.add('light-theme');
        }
    }

    // Toggle theme on button press
    themeToggleBtn.addEventListener('click', () => {
        if (bodyElement.classList.contains('dark-theme')) {
            bodyElement.classList.remove('dark-theme');
            bodyElement.classList.add('light-theme');
            localStorage.setItem('theme', 'light');
        } else {
            bodyElement.classList.remove('light-theme');
            bodyElement.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
        }
        
        // Dispatch custom event for Three.js shader adjustments
        window.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme: bodyElement.classList.contains('dark-theme') ? 'dark' : 'light' } 
        }));
    });

    let isHeaderClick = false;
    let currentRegion = 'indian'; // Enforce Indian Edition as the default
    let currentCategory = 'all';

    // ==========================================================================
    // 3. LAZY SCROLL REVEALS FOR BENTO BOX GRID CARDS (IntersectionObserver)
    // ==========================================================================
    const bentoCards = document.querySelectorAll('.bento-card');
    
    // Ensure SSR cards are immediately visible, avoiding any zero-opacity flash
    bentoCards.forEach((card) => {
        card.classList.add('reveal-attached');
        card.dataset.revealAttached = '1';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    });

    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
                observer.unobserve(card); // Stop observing once loaded
            }
        });
    };

    const bentoObserver = new IntersectionObserver(revealCallback, {
        root: null,
        threshold: 0.05,
        rootMargin: '50px 0px 50px 0px'
    });

    bentoCards.forEach(card => {
        bentoObserver.observe(card);
    });

    // ==========================================================================
    // 4. INTERACTIVE NARRATIVE PULSE (CIVIC POLL ENGINE - PERSISTENT EDITION)
    // ==========================================================================
    let currentPollData = null;

    function updatePollUI(pollData, votedIndex) {
        const pollForm = document.getElementById('civic-poll-form');
        if (!pollForm) return;

        const pollButtons = pollForm.querySelectorAll('.poll-option-btn');
        const votes = pollData.votes;
        const total = pollData.total || votes.reduce((a, b) => a + b, 0);

        pollButtons.forEach((button, bIdx) => {
            const count = votes[bIdx];
            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
            const bar = button.querySelector('.poll-bar');
            const textPercent = button.querySelector('.poll-percentage');
            
            if (bar) bar.style.width = `${percentage}%`;
            if (textPercent) textPercent.textContent = `${percentage}%`;

            const hasVoted = localStorage.getItem('hb_voted') !== null;
            if (votedIndex !== undefined || hasVoted) {
                button.disabled = true;
                button.style.cursor = 'default';
                const userVote = votedIndex !== undefined ? votedIndex : parseInt(localStorage.getItem('hb_voted'), 10);
                if (bIdx === userVote) {
                    button.style.borderColor = 'var(--accent-green)';
                    button.style.color = 'var(--text-primary)';
                } else {
                    button.style.opacity = '0.7';
                }
            }
        });

        const hasVoted = localStorage.getItem('hb_voted') !== null;
        if ((votedIndex !== undefined || hasVoted) && !pollForm.querySelector('.poll-feedback')) {
            pollForm.classList.add('votes-submitted');
            const feedbackMsg = document.createElement('p');
            feedbackMsg.className = 'poll-feedback';
            feedbackMsg.style.fontSize = '0.75rem';
            feedbackMsg.style.color = 'var(--accent-green)';
            feedbackMsg.style.fontWeight = '700';
            feedbackMsg.style.marginTop = '12px';
            feedbackMsg.style.textAlign = 'center';
            feedbackMsg.style.textTransform = 'uppercase';
            feedbackMsg.style.letterSpacing = '0.5px';
            feedbackMsg.innerHTML = '<i data-lucide="check" style="width:12px; height:12px; vertical-align:middle; margin-right:4px;"></i> Narrative Calibrated. Thanks for being honestly biased.';
            pollForm.appendChild(feedbackMsg);
            if (window.lucide) window.lucide.createIcons();
        }

        // Cache the latest poll HTML state so category switches do not flash back to defaults
        civicPollHTML = pollForm.outerHTML;
    }

    async function syncPollState() {
        try {
            const res = await fetch('/api/poll/results');
            if (res.ok) {
                currentPollData = await res.json();
                updatePollUI(currentPollData);
            }
        } catch (e) {
            console.warn("Poll API offline. Operating in fallback static mode.");
        }
    }

    // ==========================================================================
    // 5. EDITORIAL NEWSLETTER FORM INTERACTION
    // ==========================================================================
    const newsletterForm = document.getElementById('newsletter-form');
    
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const emailInput = newsletterForm.querySelector('input[type="email"]');
            const submitBtn = newsletterForm.querySelector('.newsletter-btn');
            const submitIcon = submitBtn.querySelector('i');
            const userEmail = emailInput.value;

            // Performant micro-animation during request
            submitBtn.disabled = true;
            emailInput.disabled = true;
            submitIcon.setAttribute('data-lucide', 'loader-2');
            submitIcon.classList.add('spin-anim');
            lucide.createIcons();

            const styleSheet = document.createElement("style");
            styleSheet.innerText = `@keyframes loader-spin { to { transform: rotate(360deg); } }
                                    .spin-anim { animation: loader-spin 1s linear infinite; }`;
            document.head.appendChild(styleSheet);

            try {
                const res = await fetch('/api/newsletter/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });

                submitIcon.classList.remove('spin-anim');
                
                if (res.ok) {
                    submitIcon.setAttribute('data-lucide', 'check');
                    lucide.createIcons();
                    
                    const parentElement = newsletterForm.parentElement;
                    newsletterForm.style.transition = 'opacity 0.3s ease';
                    newsletterForm.style.opacity = '0';
                    
                    setTimeout(() => {
                        newsletterForm.style.display = 'none';
                        
                        const successMsg = document.createElement('div');
                        successMsg.className = 'glass-element';
                        successMsg.style.padding = '16px';
                        successMsg.style.borderRadius = 'var(--border-radius-sm)';
                        successMsg.style.marginTop = '12px';
                        successMsg.style.borderLeft = '3px solid var(--accent-saffron)';
                        successMsg.style.boxShadow = '0 8px 24px rgba(var(--accent-saffron-rgb), 0.15)';
                        successMsg.innerHTML = `
                            <h5 style="font-weight:700; color:var(--text-primary); font-family:var(--font-editorial); font-size:0.95rem; margin-bottom:4px; letter-spacing:0.5px;">BIAS TUNED IN</h5>
                            <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.45;">Daily unfiltered commentary enabled for <strong style="color:var(--text-primary);">${userEmail}</strong>. Welcome to transparent independent coverage.</p>
                        `;
                        parentElement.appendChild(successMsg);
                    }, 300);
                } else {
                    const errData = await res.json();
                    alert(errData.error || "Subscription failed.");
                    submitBtn.disabled = false;
                    emailInput.disabled = false;
                    submitIcon.setAttribute('data-lucide', 'arrow-right');
                    lucide.createIcons();
                }
            } catch (err) {
                console.error("Newsletter submission failed:", err);
                // Fallback mock success if offline
                submitIcon.classList.remove('spin-anim');
                submitIcon.setAttribute('data-lucide', 'check');
                lucide.createIcons();
                
                const parentElement = newsletterForm.parentElement;
                newsletterForm.style.transition = 'opacity 0.3s ease';
                newsletterForm.style.opacity = '0';
                
                setTimeout(() => {
                    newsletterForm.style.display = 'none';
                    
                    const successMsg = document.createElement('div');
                    successMsg.className = 'glass-element';
                    successMsg.style.padding = '16px';
                    successMsg.style.borderRadius = 'var(--border-radius-sm)';
                    successMsg.style.marginTop = '12px';
                    successMsg.style.borderLeft = '3px solid var(--accent-saffron)';
                    successMsg.style.boxShadow = '0 8px 24px rgba(var(--accent-saffron-rgb), 0.15)';
                    successMsg.innerHTML = `
                        <h5 style="font-weight:700; color:var(--text-primary); font-family:var(--font-editorial); font-size:0.95rem; margin-bottom:4px; letter-spacing:0.5px;">BIAS TUNED IN (OFFLINE)</h5>
                        <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.45;">Saved locally for <strong style="color:var(--text-primary);">${userEmail}</strong>. Welcome to transparent independent coverage.</p>
                    `;
                    parentElement.appendChild(successMsg);
                }, 300);
            }
        });
    }

    // ==========================================================================
    // 6. DOCK STICKY NAVIGATION BLUR MODULATOR
    // ==========================================================================
    const headerElement = document.getElementById('main-header');
    
    function updateHeaderState() {
        if (!headerElement) return;
        const scrollPos = window.scrollY;
        if (scrollPos > 30) {
            headerElement.style.paddingTop = '8px';
            headerElement.style.paddingBottom = '8px';
            headerElement.style.height = '68px';
            headerElement.style.backgroundColor = 'rgba(var(--bg-primary-rgb), 0.75)';
            headerElement.style.boxShadow = '0 12px 35px -10px rgba(0, 0, 0, 0.6)';
        } else {
            headerElement.style.paddingTop = '0px';
            headerElement.style.paddingBottom = '0px';
            headerElement.style.height = 'var(--header-height)';
            headerElement.style.backgroundColor = 'var(--bg-card)';
            headerElement.style.boxShadow = 'var(--glass-shadow)';
        }
    }
    
    window.addEventListener('scroll', updateHeaderState);
    updateHeaderState(); // Execute immediately on load to prevent initial load transition jumps

    // ==========================================================================
    // 7. DYNAMIC LIVE NEWS INJECTION & INTERACTIVE BENTO CATEGORY FILTERS
    // ==========================================================================
    let allArticles = [];

    const categoryMetadata = {
        'all': {
            title: "The Ledger",
            subtitle: "Dismantling corporate bias and manufactured consent, systematically"
        },
        'Politics': {
            title: "Politics Chronicles",
            subtitle: "Dismantling policy actions, governance narratives, and institutional biases"
        },
        'Tech': {
            title: "Tech Audits",
            subtitle: "Decoding algorithmic narratives, platform surveillance, and tech-capital monopolies"
        },
        'Finance': {
            title: "Financial Audits",
            subtitle: "Deconstructing market narratives, shadow banking, and central bank monopolies"
        },
        'Entertainment': {
            title: "Entertainment Ledger",
            subtitle: "Auditing media hegemony, star-manufacturing machinery, and algorithmic spectacle"
        },
        'Health': {
            title: "Health Audits",
            subtitle: "Auditing health systems, pharmaceutical lobbying, public welfare, and medical narratives"
        },
        'Crime & Law': {
            title: "Crime & Law Chronicles",
            subtitle: "Deconstructing judicial proceedings, policing narratives, and statutory power structures"
        },
        'World & Civic': {
            title: "World & Civic Audits",
            subtitle: "Investigating geopolitical framing, civic movements, and multilateral foreign policy"
        },
        'Sports': {
            title: "Sports Ledger",
            subtitle: "Interrogating sports-capital conglomerates, athletic governance, and competitive media spin"
        }
    };

    const gridContainer = document.getElementById('dynamic-bento-grid');

    async function loadDynamicArticles() {
        // Check if __SSR_DATA__ inline JSON exists (primary hydration source)
        const ssrDataEl = document.getElementById('__SSR_DATA__');
        if (ssrDataEl) {
            try {
                const ssrData = JSON.parse(ssrDataEl.textContent);
                if (ssrData.articles && ssrData.articles.length > 0) {
                    console.log(`⚡ __SSR_DATA__ found with ${ssrData.articles.length} articles — instant hydration`);
                    allArticles = ssrData.articles.map(a => ({ ...a }));
                    // Articles with hasBase64Image flag have gradient placeholder in SSR
                    // Real images will be fetched when app.js re-renders cards from API
                    const base64Count = allArticles.filter(a => a.hasBase64Image).length;
                    if (base64Count > 0) console.log(`🖼️ ${base64Count} articles have base64 images (gradient placeholder shown, real image on API re-fetch)`);

                    // Hydrate highlights ticker from SSR data
                    if (allArticles.length > 0) {
                        const tickerTrack = document.querySelector('.ticker-track');
                        if (tickerTrack) {
                            let rawHighlights = allArticles.slice(0, 6).map(a => cleanEditorialText(a.aiheadline || a.title)).filter(Boolean);
                            let unique = Array.from(new Set(rawHighlights));
                            let loop = unique.length > 0 ? [...unique, ...unique] : [];
                            tickerTrack.innerHTML = loop.map(text => `<span>• ${escapeHtml(text)}</span>`).join('');
                        }
                    }

                    // Skip the API fetch — SSR data is already here!
                    // This saves a 4.3MB / 4.5s API round-trip
                    console.log('✅ Skipping API fetch — using SSR data for instant load');
                    handleRouting(true);
                    
                    // Background: fetch real images for base64 articles AND full article list for pagination
                    const base64Articles = allArticles.filter(a => a.hasBase64Image);
                    if (base64Articles.length > 0) {
                        console.log(`🖼️ Background fetch: hydrating ${base64Articles.length} base64 images from API`);
                        setTimeout(async () => {
                            try {
                                const res = await fetch('/api/honestly-biased-feed');
                                const data = await res.json();
                                const apiArticles = data.articles || [];
                                // Update allArticles with real image URLs
                                base64Articles.forEach(bs64 => {
                                    const match = apiArticles.find(a => a.id === bs64.id);
                                    if (match && match.imageurl && match.imageurl.startsWith('data:image')) {
                                        bs64.imageurl = match.imageurl;
                                        bs64.hasBase64Image = false;
                                    }
                                });
                                // Re-render cards with real images
                                handleRouting(false);
                                console.log('✅ Base64 images hydrated with real images');
                            } catch (e) {
                                console.warn('Background image fetch failed:', e);
                            }
                        }, 2000);
                    }
                    
                    // Immediately fetch FULL article catalog for pagination and latest dispatches
                    setTimeout(async () => {
                        try {
                            const res = await fetch('/api/honestly-biased-feed?limit=1000');
                            const data = await res.json();
                            const apiArticles = data.articles || [];
                            if (apiArticles.length > 0) {
                                const existingIds = new Set(allArticles.map(a => String(a.id)));
                                const newArticles = apiArticles.filter(a => !existingIds.has(String(a.id)));
                                if (newArticles.length > 0) {
                                    allArticles.push(...newArticles);
                                    // Sort newest-first by publishdate
                                    allArticles.sort((a, b) => {
                                        const timeA = a.publishdate ? new Date(a.publishdate).getTime() : parseFloat(String(a.id).replace(/\D/g, '')) || 0;
                                        const timeB = b.publishdate ? new Date(b.publishdate).getTime() : parseFloat(String(b.id).replace(/\D/g, '')) || 0;
                                        return timeB - timeA;
                                    });
                                    console.log(`📄 Catalog: hydrated ${newArticles.length} additional articles (total ${allArticles.length})`);
                                    // Re-route to update pagination and grid with full catalog
                                    handleRouting(false);
                                }
                            }
                        } catch (e) {
                            console.warn('Background full article fetch failed:', e);
                        }
                    }, 50);
                    
                    return; // ← EXIT EARLY, don't fetch from API
                }
            } catch (e) {
                console.warn('SSR data parse failed:', e);
            }
        }

        // Check if SSR already populated the bento grid
        const gridContainer = document.getElementById('dynamic-bento-grid');
        const ssrCards = gridContainer ? gridContainer.querySelectorAll('.bento-card') : [];
        const hasSSRContent = ssrCards.length > 0;
        
        if (hasSSRContent) {
            console.log(`⚡ SSR detected ${ssrCards.length} pre-rendered cards, skipping initial render`);
            // Extract articles from SSR cards for pagination
            ssrCards.forEach(card => {
                const id = card.id;
                const link = card.querySelector('a.stretched-link');
                const headline = link ? link.textContent : '';
                const summary = card.querySelector('.card-summary')?.textContent || '';
                const badge = card.querySelector('.author-type-badge');
                const category = card.querySelector('.card-tag')?.textContent || '';
                const timeEl = card.querySelector('.card-time')?.textContent || '';
                const bias = card.querySelector('.card-author')?.textContent?.replace('Bias Audit: ', '') || '';
                const imgEl = card.querySelector('.card-image-bg');
                // For base64 articles, SSR uses gradient placeholder (no bg image)
                // Real image URL will be restored from __SSR_DATA__ or feed API
                const bgMatch = imgEl?.style.backgroundImage?.match(/url\(['"]?([^'")]*)/);
                const imgUrl = bgMatch ? bgMatch[1] : '';
                const authortype = badge?.classList.contains('badge-admin') ? 'admin' :
                                   badge?.classList.contains('badge-instagram') ? 'instagram' : 'ai';
                
                allArticles.push({
                    id,
                    aiheadline: headline,
                    aisummary: summary,
                    biasaudit: bias,
                    category,
                    timeago: timeEl,
                    imageurl: imgUrl,
                    authortype
                });
            });
            console.log(`📦 Extracted ${allArticles.length} articles from SSR for pagination`);
        }

        console.log("📡 Fetching site_content blocks first, then live feed...");

        // ------------------------------------------------------------
        // 1. Wait for PerspectiveLens to be ready, then hydrate site content
        // ------------------------------------------------------------
        let lensReady = false;
        const maxWait = 5000;
        const startTime = Date.now();
        
        while (!lensReady && (Date.now() - startTime) < maxWait) {
            if (window.PerspectiveLens && window.PerspectiveLens.material) {
                lensReady = true;
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        
        if (!lensReady) {
            console.warn('PerspectiveLens not ready after timeout, proceeding anyway');
        }
        
        try { await hydrateSiteContent(); }
        catch (e) { console.warn('site_content hydration failed:', e); }

        console.log("📡 Attempting to fetch live AI-calibrated Honestly Biased feed...");

        try {
            // Call the local backend server (running on port 3000)
            const response = await fetch('/api/honestly-biased-feed?limit=1000');
            
            if (!response.ok) {
                throw new Error(`API returned HTTP status ${response.status}`);
            }

            const data = await response.json();
            console.log("🟢 Live feed loaded successfully. Calibrating bento boxes...");

            // Store dynamic articles globally and clean headlines from "Refracted: " prefix
            allArticles = (data.articles || []).map(art => {
                const headline = (art.aiheadline || art.aiHeadline || art.title || '').replace(/^Refracted:\s*/i, '');
                const summary = art.aisummary || art.aiSummary || art.description || art.summary || '';
                art.aiheadline = headline;
                art.aiHeadline = headline;
                art.title = headline;
                art.aisummary = summary;
                art.aiSummary = summary;
                art.description = summary;
                art.imageurl = art.imageurl || art.imageUrl || './assets/hero-bg.png';
                art.imageUrl = art.imageurl;
                return art;
            });

            // Dynamically update the ticker highlights banner
            let highlightsToRender = data.highlights || [];
            if (highlightsToRender.length === 0 && allArticles.length > 0) {
                highlightsToRender = allArticles.slice(0, 6).map(a => a.aiheadline || a.title);
            }
            if (highlightsToRender.length > 0) {
                const tickerTrack = document.querySelector('.ticker-track');
                if (tickerTrack) {
                    let rawHighlights = highlightsToRender.map(cleanEditorialText).filter(Boolean);
                    let unique = Array.from(new Set(rawHighlights));
                    let loop = unique.length > 0 ? [...unique, ...unique] : [];
                    tickerTrack.innerHTML = loop.map(text => `<span>• ${escapeHtml(text)}</span>`).join('');
                }
            }

            // B. Initial dynamic grid render based on the current hash route
            handleRouting(true);

        } catch (error) {
            console.log("\n=============================================================");
            console.log("ℹ️  INFO: Live backend API is not currently active.");
            console.log("👉 The website is running beautifully in offline static mode.");
            console.log("👉 Run 'node mock-server.js' in the background to activate AI rewrites!");
            console.log("=============================================================\n");

            // Populate fallback highlights ticker
            const tickerTrack = document.querySelector('.ticker-track');
            if (tickerTrack) {
                const fallbackAlerts = [
                    "[MEDIA AUDIT]: Manufactured consent monitored in prime-time transcript analyses.",
                    "[FINANCIAL WATCH]: Shadow banking narrative expansion detected in central bank briefing notes.",
                    "[TECH MONOPOLY]: Algorithmic platform surveillance frameworks under active critique.",
                    "[HEALTH AUDIT]: Pharmaceutical lobbying budgets monitored in recent healthcare bills."
                ];
                let loop = [...fallbackAlerts, ...fallbackAlerts];
                tickerTrack.innerHTML = loop.map(text => `<span>• ${escapeHtml(text)}</span>`).join('');
            }

            allArticles = [];
            handleRouting(true);
        }
    }

    // Select modal DOM elements
    const auditModal = document.getElementById('audit-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // Modal elements to hydrate
    const modalCategory = document.getElementById('modal-category');
    const modalTime = document.getElementById('modal-time');
    const modalTitle = document.getElementById('modal-title');
    const modalSource = document.getElementById('modal-source');
    const modalBiasAudit = document.getElementById('modal-bias-audit');
    const modalSummary = document.getElementById('modal-summary');
    const modalOriginalLink = document.getElementById('modal-original-link');

    // Function to open modal and hydrate
    function openArticleModal(articleId) {
        const article = allArticles.find(a => String(a.id) === String(articleId));
        if (!article) return;

        console.log(`👁️ Opening Honestly Biased audit modal for article: "${article.aiheadline}"`);

        // Hydrate details
        if (modalCategory) {
            modalCategory.textContent = article.category;
            // Align color tags based on category
            modalCategory.className = 'modal-tag ' + (article.category.toLowerCase().trim() === 'tech' ? 'green-bg' : 'saffron-bg');
        }
        if (modalTime) modalTime.innerHTML = `<i data-lucide="clock"></i> ${article.timeago || (article.publishdate ? formatDate(article.publishdate) : '')}`;
        if (modalTitle) modalTitle.textContent = cleanEditorialText(article.aiheadline || '');
        if (modalSource) modalSource.textContent = `Source: ${article.originalsource || article.originaltitle || article.author || 'Honestly Biased Editorial Desk'}`;
        if (modalBiasAudit) modalBiasAudit.textContent = cleanEditorialText(article.biasaudit || '');
        if (modalSummary) modalSummary.textContent = cleanEditorialText(article.aisummary || '');
        if (modalOriginalLink) modalOriginalLink.href = article.originalurl || '#';

        // Dynamic Author Badging in Modal Reader (The Ledger Desk)
        const modalAuthor = document.querySelector('.modal-author');
        if (modalAuthor) {
            if (article.authortype === 'admin') {
                modalAuthor.innerHTML = `<i data-lucide="pen-tool" style="width:14px; height:14px;"></i> The Ledger Desk`;
                modalAuthor.style.color = 'var(--accent-saffron)';
            } else if (article.authortype === 'instagram') {
                modalAuthor.innerHTML = `<i data-lucide="instagram" style="width:14px; height:14px;"></i> Honestly Biased AI Engine (Instagram Ingestion)`;
                modalAuthor.style.color = '#e1306c'; // Instagram Pink
            } else {
                modalAuthor.innerHTML = `<i data-lucide="shield-check" style="width:14px; height:14px;"></i> Audited by Honestly Biased AI Engine`;
                modalAuthor.style.color = '#00E5FF'; // Neon Blue
            }
        }

        // Side-by-Side Corporate Spin vs. Reality comparison box
        const rawSource = article.originalsource || 'Mainstream Press Wire';
        const rawFraming = article.originaltitle || article.title || article.originalsource || 'Standard Institutional Press Wire';
        const spinHtml = `
            <div class="spin-comparison-box">
                <div class="spin-col-raw">
                    <span class="spin-col-title"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Corporate PR Spin / Wire</span>
                    <p style="font-size:0.86rem; color:var(--text-secondary); margin:0 0 6px 0;"><strong>${escapeHtml(rawSource)}:</strong> ${escapeHtml(rawFraming)}</p>
                    ${article.originalurl ? `<a href="${escapeAttr(article.originalurl)}" target="_blank" rel="noopener noreferrer" style="font-size:0.75rem; color:var(--accent-saffron); text-decoration:underline;">Inspect raw source →</a>` : ''}
                </div>
                <div class="spin-col-audited">
                    <span class="spin-col-title"><i data-lucide="shield-check" style="width:12px;height:12px;"></i> Honestly Biased Audit</span>
                    <p style="font-size:0.86rem; color:var(--text-primary); margin:0;">${escapeHtml(article.biasaudit || 'Forensic analysis reveals institutional omissions and unexamined stakeholder incentives.')}</p>
                </div>
            </div>
        `;
        let spinEl = document.getElementById('modal-spin-box');
        if (!spinEl) {
            spinEl = document.createElement('div');
            spinEl.id = 'modal-spin-box';
            const callout = document.querySelector('.bias-audit-callout');
            if (callout && callout.parentNode) {
                callout.parentNode.insertBefore(spinEl, callout.nextSibling);
            }
        }
        if (spinEl) spinEl.innerHTML = spinHtml;

        // Dynamic Media Container Hydration
        const mediaContainer = document.getElementById('modal-media-container');
        if (mediaContainer) {
            if (article.authortype === 'instagram' && article.instagramShortcode) {
                mediaContainer.style.display = 'block';
                mediaContainer.innerHTML = `
                    <div class="instagram-embed-wrapper" style="position: relative; width: 100%; max-width: 540px; margin: 0 auto; aspect-ratio: 328/420; background: rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; border: 1px solid rgba(225, 48, 108, 0.3);">
                        <iframe src="https://www.instagram.com/p/${article.instagramShortcode}/embed" 
                                class="instagram-media instagram-media-rendered" 
                                allowtransparency="true" 
                                allowfullscreen="true" 
                                frameborder="0" 
                                height="100%" 
                                scrolling="no" 
                                style="background: white; border: 0; margin: 0; padding: 0; width: 100%; height: 100%; display: block; min-height: 420px;">
                        </iframe>
                    </div>
                `;
            } else if (article.imageurl) {
                mediaContainer.style.display = 'block';
                mediaContainer.innerHTML = `
                    <img src="${article.imageurl}" alt="${article.aiheadline}" style="width: 100%; max-height: 320px; object-fit: cover; border-radius: 8px; border: 1.5px solid var(--border-glass);">
                `;
            } else {
                mediaContainer.style.display = 'none';
                mediaContainer.innerHTML = '';
            }
        }

        // Open modal
        if (auditModal) {
            auditModal.style.display = 'flex';
            auditModal.classList.add('open');
            auditModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        }

        // Push URL to browser history (/chronicles/:slug)
        const slug = article.slug || shortIdFromUuid(article.id);
        if (window.history && window.history.pushState) {
            window.history.pushState({ modalOpen: true, articleId: article.id, slug }, '', `/chronicles/${slug}`);
        }

        // Re-compile Lucide icons inside the modal
        lucide.createIcons();
    }

    function closeArticleModal() {
        if (auditModal) {
            auditModal.classList.remove('open');
            auditModal.setAttribute('aria-hidden', 'true');
            auditModal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
        
        // Restore browser URL if on /chronicles/
        if (window.history && window.location.pathname.startsWith('/chronicles/')) {
            window.history.pushState(null, '', '/');
        }

        // Dispose of media content to stop background iframe audio playback
        const mediaContainer = document.getElementById('modal-media-container');
        if (mediaContainer) {
            mediaContainer.innerHTML = '';
            mediaContainer.style.display = 'none';
        }
    }

    // Modal click listeners
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeArticleModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeArticleModal);

    // Escape key press to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeArticleModal();
                    }
                });

                // Pagination state & search state
                let currentPage = 1;
                let itemsPerPage = 12;
                let totalPages = 1;
                let currentSearchQuery = '';

                // Toast notification utility
                function showToast(message) {
                    let toast = document.getElementById('hb-global-toast');
                    if (!toast) {
                        toast = document.createElement('div');
                        toast.id = 'hb-global-toast';
                        toast.className = 'hb-toast';
                        document.body.appendChild(toast);
                    }
                    toast.innerHTML = `<i data-lucide="check-circle" style="width:16px;height:16px;color:var(--accent-saffron);"></i> <span>${escapeHtml(message)}</span>`;
                    if (window.lucide) lucide.createIcons();
                    toast.classList.add('show');
                    clearTimeout(toast._timeout);
                    toast._timeout = setTimeout(() => {
                        toast.classList.remove('show');
                    }, 2800);
                }

                function buildClientVerdictChipHtml(biasaudit) {
                    if (!biasaudit) return '';
                    const clean = cleanEditorialText(biasaudit);
                    return `
                        <div class="card-verdict-chip" title="${escapeHtml(clean)}">
                            <span class="verdict-label"><i data-lucide="shield-alert"></i> VERDICT</span>
                            <span class="verdict-text">${escapeHtml(clean)}</span>
                        </div>
                    `;
                }

                // Dynamic Asymmetrical Bento Grid compiler
                function renderArticles(regionFilter, categoryFilter) {
                    if (!gridContainer) return;

                    // Clear existing grid
                    gridContainer.innerHTML = "";

                    // 1. Sort all articles newest-first by publishdate or ID
                    const sortedArticles = [...allArticles].sort((a, b) => {
                        const timeA = a.publishdate ? new Date(a.publishdate).getTime() : parseFloat(String(a.id).replace(/\D/g, '')) || 0;
                        const timeB = b.publishdate ? new Date(b.publishdate).getTime() : parseFloat(String(b.id).replace(/\D/g, '')) || 0;
                        return timeB - timeA;
                    });

                    // 2. Filter articles by region, category, and live search query
                    const filteredArticles = sortedArticles.filter(art => {
                        const matchRegion = regionFilter === 'all'
                            ? true
                            : (art.region || 'indian').toLowerCase().trim() === regionFilter.toLowerCase().trim();

                        const headline = cleanEditorialText(art.aiheadline || art.title || '');
                        const summary = cleanEditorialText(art.aisummary || art.summary || '');
                        const category = classifyClientCategory(art.category, headline, summary);

                        const matchCategory = categoryFilter === 'all'
                            ? true
                            : category.toLowerCase().trim() === categoryFilter.toLowerCase().trim();

                        if (!matchRegion || !matchCategory) return false;

                        if (currentSearchQuery) {
                            const q = currentSearchQuery.toLowerCase();
                            const bias = (art.biasaudit || '').toLowerCase();
                            const src = (art.originalsource || '').toLowerCase();
                            const combined = `${headline.toLowerCase()} ${summary.toLowerCase()} ${category.toLowerCase()} ${bias} ${src}`;
                            if (!combined.includes(q)) return false;
                        }

                        return true;
                    });

                    // Exclude active Hero story from slot 1 of The Ledger grid on Page 1 when viewing all
                    let displayArticles = filteredArticles;
                    if (regionFilter === 'all' && categoryFilter === 'all' && currentPage === 1 && !currentSearchQuery) {
                        const heroId = document.querySelector('.hero-section')?.getAttribute('data-id') || sortedArticles[0]?.id;
                        if (heroId) {
                            displayArticles = filteredArticles.filter(art => String(art.id) !== String(heroId));
                        }
                    }

                    // 3. Pagination math (12 / 24 / 48)
                    totalPages = Math.ceil(displayArticles.length / itemsPerPage) || 1;
                    if (currentPage > totalPages) currentPage = totalPages;
                    if (currentPage < 1) currentPage = 1;
                
                    const startIdx = (currentPage - 1) * itemsPerPage;
                    const endIdx = startIdx + itemsPerPage;
                    const paginatedArticles = displayArticles.slice(startIdx, endIdx);

                    console.log(`🎯 Filtering: Region "${regionFilter}", Category "${categoryFilter}", Search "${currentSearchQuery}", Page ${currentPage}/${totalPages} (${itemsPerPage} per page) matched ${displayArticles.length} articles, showing ${paginatedArticles.length}.`);

                    // Update pagination UI
                    updatePaginationUI();

                    if (paginatedArticles.length === 0) {
                        // Display empty state
                        gridContainer.innerHTML = `
                            <div class="bento-card bento-span-4x1 glass-element" style="grid-column: span 4; padding: 48px; text-align: center; justify-content: center; align-items: center; border-style: dashed; grid-row: span 1;">
                                <i data-lucide="archive-x" style="width: 48px; height: 48px; color: var(--accent-saffron); margin-bottom: 16px;"></i>
                                <h3 style="font-family: var(--font-heading); font-size: 1.25rem; font-weight: 700; margin-bottom: 8px;">No Chronicles Found</h3>
                                <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 400px; margin: 0 auto;">Our AI Editorial desk hasn't logged any audited headlines under "${categoryFilter}" in this region. Check back shortly!</p>
                            </div>
                        `;
                        lucide.createIcons();
                        return;
                    }

                    // Build list of final DOM nodes/strings dynamically
                    const gridItems = [];

                    paginatedArticles.forEach((article, index) => {
                        const rawHeadline = article.aiheadline || article.aiHeadline || article.title || 'Untitled Chronicle';
                        const rawSummary = article.aisummary || article.aiSummary || article.description || article.summary || '';
                        const rawBias = article.biasaudit || article.biasAudit || '';
                        
                        const headline = cleanEditorialText(rawHeadline);
                        const summary = cleanEditorialText(rawSummary);
                        const biasAudit = cleanEditorialText(rawBias);
                        const category = classifyClientCategory(article.category, headline, summary);

                        const slug = article.slug || shortIdFromUuid(article.id);
                        const articleUrl = `/chronicles/${slug}`;
                        const fullArticleUrl = `${window.location.origin}${articleUrl}`;
                        const cardLink = `<a href="${articleUrl}" class="stretched-link audit-trigger" data-id="${escapeHtml(article.id)}" data-slug="${escapeHtml(slug)}">${escapeHtml(headline)}</a>`;

                        const isInstagram = article.authortype === 'instagram';

                        const relTime = formatRelativeTime(article.publishdate);
                        const fullTimestamp = (article.publishdate ? formatDate(article.publishdate) + ' ' : '') + (article.timeago || '');
                        const readTime = calculateReadTime(summary + ' ' + (article.fullblog || ''));
                        const verdictHtml = buildClientVerdictChipHtml(biasAudit);

                        const rawImg = article.imageurl || '/assets/hero-bg.png';
                        const isBase64 = rawImg.startsWith('data:image');
                        const imgUrl = isBase64 ? '' : rawImg;
                        const bgStyle = imgUrl
                            ? `background-image: url('${imgUrl}')`
                            : 'background: linear-gradient(135deg, #0A0E17 0%, #141B29 100%)';

                        const cardActions = `
                            <div class="card-action-bar">
                                <a href="${articleUrl}" class="inspect-audit-btn audit-trigger" data-id="${escapeHtml(article.id)}" data-slug="${escapeHtml(slug)}" aria-label="Inspect Audit: ${escapeHtml(headline)}">
                                    <i data-lucide="scan-eye"></i> <span>Inspect Audit</span>
                                </a>
                                <button type="button" class="share-receipt-btn" data-headline="${escapeHtml(headline)}" data-verdict="${escapeHtml(biasAudit)}" data-url="${escapeHtml(fullArticleUrl)}" aria-label="Share Bias Receipt">
                                    <i data-lucide="share-2"></i> <span>Share</span>
                                </button>
                            </div>
                        `;

                        const metaRowHtml = `
                            <div class="card-meta-row" style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-family:var(--font-mono, monospace); font-size:0.72rem; color:var(--text-muted); font-weight:600; letter-spacing:0.04em;">
                                <span style="color:var(--accent-saffron); font-weight:700; text-transform:uppercase;">${escapeHtml(category)}</span>
                                <span class="meta-dot">·</span>
                                <span>${escapeHtml(readTime)}</span>
                                <span class="meta-dot">·</span>
                                <span title="${escapeHtml(fullTimestamp)}">${escapeHtml(relTime)}</span>
                            </div>
                        `;

                        // Layout pattern: 4 Featured horizontals (2x1) -> Standard cards (1x1) with images
                        if (index >= 0 && index <= 3) {
                            gridItems.push(`
                                <article class="bento-card bento-span-2x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeHtml(article.id)}">
                                    <div class="card-visual">
                                        <div class="card-image-bg" style="${bgStyle};"></div>
                                        ${isInstagram ? '<span class="video-play-overlay"><i data-lucide="arrow-up-right"></i></span>' : ''}
                                    </div>
                                    <div class="card-body">
                                        ${metaRowHtml}
                                        <h3 class="card-title" style="margin-top:4px;">
                                            ${cardLink}
                                        </h3>
                                        <p class="card-summary">${escapeHtml(summary)}</p>
                                        <div class="card-footer-meta">
                                            ${verdictHtml}
                                            ${cardActions}
                                        </div>
                                    </div>
                                </article>
                            `);
                        } else {
                            gridItems.push(`
                                <article class="bento-card bento-span-1x1 glass-element ${isInstagram ? 'card-instagram' : ''}" id="${escapeHtml(article.id)}">
                                    <div class="card-visual">
                                        <div class="card-image-bg" style="${bgStyle};"></div>
                                    </div>
                                    <div class="card-body">
                                        ${metaRowHtml}
                                        <h3 class="card-title" style="margin-bottom:8px;">
                                            ${cardLink}
                                        </h3>
                                        <p class="card-summary small-summary">${escapeHtml(summary)}</p>
                                        <div class="card-footer-meta">
                                            ${verdictHtml}
                                            ${cardActions}
                                        </div>
                                    </div>
                                </article>
                            `);
                        }
                    });

        // Interlace our layout fixtures dynamically based on the category filter
        // If showing 'all', we interlace at perfect visual intervals.
        if (categoryFilter === 'all') {
            // No static widgets to interlace - only paginated articles
        } else {
            // "each tab should have its own space" - do not append global widgets to category-specific views!
        }

        // Hydrate grid container
        gridContainer.innerHTML = gridItems.join('');

        // Apply smooth reveal animations
        const cards = gridContainer.querySelectorAll('.bento-card, blockquote, section, aside');
        cards.forEach((card, index) => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
            card.style.transition = `opacity 0.35s ease ${Math.min(index * 0.03, 0.3)}s, 
                                     transform 0.35s ease ${Math.min(index * 0.03, 0.3)}s,
                                     background var(--transition-medium),
                                     border-color var(--transition-medium),
                                     box-shadow var(--transition-medium)`;
        });

        // Refresh icons and play logic binding
        lucide.createIcons();
        bindDynamicEvents();

        // Re-bind scroll-reveal observer: dynamically rendered bento cards start
        // with opacity:0; transform:translateY(30px) inline so they animate in.
        // Without re-observing them they would never reveal on reload when the
        // grid is rebuilt from the API response.
        const freshCards = gridContainer.querySelectorAll('.bento-card');
        freshCards.forEach(card => {
            // skip ones the static observer already captured
            if (!card.classList.contains('reveal-attached')) {
                card.classList.add('reveal-attached');
                card.dataset.revealAttached = '1';
                card.style.transition = card.style.transition ||
                    'opacity 0.8s cubic-bezier(0.25, 1, 0.5, 1), transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
                bentoObserver.observe(card);
            }
        });

        // Safety net: if any card is still invisible after 800ms (e.g. user has
        // reduced motion or the observer never fired because the card was rendered
        // already in-view but the entry was missed), reveal them. Prevents
        // reload returning a "clear space" if the network call landed
        // after the IntersectionObserver attached only to the static markup.
        setTimeout(() => {
            freshCards.forEach(card => {
                if (getComputedStyle(card).opacity === '0') {
                    card.style.opacity = '1';
                    card.style.transform = 'translateY(0)';
                }
            });
        }, 800);
    }

    function updateUrlState(region, category, page) {
        let path = '/';
        const normRegion = region === 'indian' ? 'india' : (region || 'all');
        const normCat = category && category !== 'all' ? category.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-').replace(/-+/g, '-') : 'all';

        if (normRegion !== 'all' && normCat !== 'all') {
            path = `/editions/${normRegion}/${normCat}`;
        } else if (normRegion !== 'all') {
            path = `/editions/${normRegion}`;
        } else if (normCat !== 'all') {
            path = `/category/${normCat}`;
        }

        const query = page && page > 1 ? `?page=${page}` : '';
        const targetUrl = `${path}${query}`;
        if ((window.location.pathname + window.location.search) !== targetUrl) {
            window.history.pushState({ region, category, page }, '', targetUrl);
        }
    }

    // Region Tabs Event Listeners (Triggers clean crawlable URL pushState)
    const regionButtons = document.querySelectorAll('.region-tab-btn');
    regionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (btn.tagName === 'A') e.preventDefault();
            const selectedRegion = btn.getAttribute('data-region').toLowerCase().trim();
            currentPage = 1;
            currentRegion = selectedRegion;
            updateUrlState(currentRegion, currentCategory, 1);
            handleRouting(false);
        });
    });

    // Category Tabs Event Listeners (Triggers clean crawlable URL pushState)
    const tabButtons = document.querySelectorAll('.category-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const selectedCat = btn.getAttribute('data-category').trim();
            currentPage = 1;
            currentCategory = selectedCat;
            updateUrlState(currentRegion, currentCategory, 1);
            handleRouting(false);
        });
    });

    // Re-bind interactive events for dynamic cards (like poll buttons or play buttons)
    function bindDynamicEvents() {
        // Re-bind podcast micro player
        const playBtn = gridContainer.querySelector('.play-btn-circle');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                const icon = playBtn.querySelector('i');
                if (icon.getAttribute('data-lucide') === 'play') {
                    icon.setAttribute('data-lucide', 'pause');
                    playBtn.style.background = 'var(--accent-saffron)';
                    playBtn.style.color = '#ffffff';
                } else {
                    icon.setAttribute('data-lucide', 'play');
                    playBtn.style.background = 'rgba(255,255,255,0.05)';
                    playBtn.style.color = 'var(--text-primary)';
                }
                lucide.createIcons();
            });
        }

        // Re-bind HTML5 video component controls (Card 6)
        const videoElement = gridContainer.querySelector('#card-6-video');
        const videoPlayBtn = gridContainer.querySelector('.video-play-overlay');

        if (videoElement && videoPlayBtn) {
            const videoIcon = videoPlayBtn.querySelector('i');
            
            // Toggle play/pause state when overlay button is clicked
            videoPlayBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card selection triggering
                toggleVideoPlayback();
            });

            // Toggle play/pause state when video element itself is clicked
            videoElement.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleVideoPlayback();
            });

            function toggleVideoPlayback() {
                if (videoElement.paused) {
                    videoElement.play().catch(err => console.log("Video play interrupted:", err));
                    videoPlayBtn.classList.add('playing');
                    if (videoIcon) {
                        videoIcon.setAttribute('data-lucide', 'pause');
                    }
                } else {
                    videoElement.pause();
                    videoPlayBtn.classList.remove('playing');
                    if (videoIcon) {
                        videoIcon.setAttribute('data-lucide', 'play');
                    }
                }
                lucide.createIcons();
            }

            // Sync icon and class if video finishes playing or is paused/played externally
            videoElement.addEventListener('pause', () => {
                videoPlayBtn.classList.remove('playing');
                if (videoIcon) videoIcon.setAttribute('data-lucide', 'play');
                lucide.createIcons();
            });

            videoElement.addEventListener('play', () => {
                videoPlayBtn.classList.add('playing');
                if (videoIcon) videoIcon.setAttribute('data-lucide', 'pause');
                lucide.createIcons();
            });
        }

        // Bind article page routing to all audit-trigger items
        const triggers = gridContainer.querySelectorAll('.audit-trigger');
        triggers.forEach(t => {
            t.addEventListener('click', (e) => {
                e.preventDefault();
                const href = t.getAttribute('href');
                if (href && href !== '#' && !href.startsWith('#')) {
                    window.location.href = href;
                } else {
                    const id = t.getAttribute('data-id');
                    const art = allArticles.find(a => String(a.id) === String(id));
                    window.location.href = getArticleUrl(art || { id });
                }
            });
        });

        // Bind 1-click share receipt buttons
        const shareBtns = gridContainer.querySelectorAll('.share-receipt-btn');
        shareBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const headline = btn.getAttribute('data-headline') || '';
                const verdict = btn.getAttribute('data-verdict') || '';
                const url = btn.getAttribute('data-url') || window.location.href;
                const shareText = `📰 ${headline}\n⚡ Bias Audit: ${verdict}\n🔗 Read at ${url}`;

                if (navigator.share) {
                    try {
                        await navigator.share({
                            title: headline,
                            text: shareText,
                            url: url
                        });
                        return;
                    } catch (err) {
                        // User cancelled or browser rejected — fallback to clipboard
                    }
                }

                try {
                    await navigator.clipboard.writeText(shareText);
                    showToast('Audit receipt copied to clipboard!');
                } catch (err) {
                    window.prompt('Copy shareable audit receipt:', shareText);
                }
            });
        });

        // Re-bind civic poll click listeners
        const pollForm = gridContainer.querySelector('#civic-poll-form');
        if (pollForm) {
            const pollButtons = pollForm.querySelectorAll('.poll-option-btn');
            pollButtons.forEach((btn, index) => {
                btn.addEventListener('click', async () => {
                    if (localStorage.getItem('hb_voted') !== null) return;
                    localStorage.setItem('hb_voted', index);
                    
                    try {
                        const res = await fetch('/api/poll/vote', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ optionIndex: index })
                        });
                        if (res.ok) {
                            currentPollData = await res.json();
                            updatePollUI(currentPollData, index);
                        } else {
                            // Fallback if rate limited or server error
                            const fallbackData = currentPollData || { votes: [74, 18, 8], total: 100 };
                            fallbackData.votes[index] += 1;
                            fallbackData.total += 1;
                            updatePollUI(fallbackData, index);
                        }
                    } catch (err) {
                        const fallbackData = currentPollData || { votes: [74, 18, 8], total: 100 };
                        fallbackData.votes[index] += 1;
                        fallbackData.total += 1;
                        updatePollUI(fallbackData, index);
                    }
                });
            });

            // Update UI with existing fetched poll data or localStorage
            if (currentPollData) {
                updatePollUI(currentPollData);
            } else {
                // Fetch initially if not done yet
                syncPollState();
            }
        }
    }

    // SPA Router Implementation - Supports clean crawlable paths (/editions/india, /category/politics, ?page=2)
    function parseCurrentRoute() {
        const pathname = window.location.pathname.toLowerCase();
        let region = 'all';
        let category = 'all';

        const validRegions = ['all', 'indian', 'india', 'world', 'uk', 'berkshire'];
        const validCategories = ['politics', 'tech', 'finance', 'crime-and-law', 'crime & law', 'world-and-civic', 'world & civic', 'sports', 'entertainment', 'health'];

        // 1. Check clean pathname
        if (pathname.startsWith('/editions/')) {
            const parts = pathname.replace(/^\/editions\//, '').split('/').filter(Boolean);
            if (parts[0]) {
                region = parts[0] === 'india' ? 'indian' : parts[0];
            }
            if (parts[1]) {
                category = parts[1];
            }
        } else if (pathname.startsWith('/category/')) {
            const cat = pathname.replace(/^\/category\//, '').split('/')[0];
            if (cat) category = cat;
        } else if (window.location.hash) {
            // Legacy hash support
            const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
            if (hash && hash !== 'all') {
                const parts = hash.split('/').filter(Boolean);
                if (parts.length === 1) {
                    if (validRegions.includes(parts[0])) region = parts[0] === 'india' ? 'indian' : parts[0];
                    else category = parts[0];
                } else if (parts.length >= 2) {
                    if (validRegions.includes(parts[0])) region = parts[0] === 'india' ? 'indian' : parts[0];
                    category = parts[1];
                }
            }
        }

        // 2. Query param ?page=2
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = parseInt(urlParams.get('page'), 10);
        if (pageParam && !isNaN(pageParam) && pageParam > 0) {
            currentPage = pageParam;
        }

        let targetCategory = 'all';
        const cleanCat = category.replace(/&/g, 'and').replace(/\s+/g, '-').toLowerCase();
        if (cleanCat === 'politics') targetCategory = 'Politics';
        else if (cleanCat === 'tech') targetCategory = 'Tech';
        else if (cleanCat === 'finance') targetCategory = 'Finance';
        else if (cleanCat === 'crime-and-law' || cleanCat === 'crime-law') targetCategory = 'Crime & Law';
        else if (cleanCat === 'world-and-civic' || cleanCat === 'world-civic') targetCategory = 'World & Civic';
        else if (cleanCat === 'entertainment') targetCategory = 'Entertainment';
        else if (cleanCat === 'health') targetCategory = 'Health';
        else if (cleanCat === 'sports' || cleanCat === 'sport') targetCategory = 'Sports';

        return { region, category: targetCategory };
    }

    function handleRouting(isInitialLoad = false) {
        const hash = window.location.hash;
        console.log(`🌐 SPA Routing event triggered: pathname="${window.location.pathname}", search="${window.location.search}", hash="${hash}", isInitialLoad=${isInitialLoad}`);

        // Check if SSR content exists and we should preserve it on initial load
        const hasSSRContent = document.getElementById('dynamic-bento-grid')?.querySelector('.bento-card');
        
        // Handle Article Detail Page Routing (supports #/chronicles/ and #/article/)
        if (hash.startsWith('#/chronicles/') || hash.startsWith('#/article/')) {
            const slug = hash.replace(/^#\/(chronicles|article)\//, '').trim();
            const matched = allArticles.find(a => (a.slug && a.slug.toLowerCase() === slug.toLowerCase()) || shortIdFromUuid(a.id) === slug.toLowerCase() || String(a.id) === slug);
            if (matched) {
                showArticleDetailPage(matched.id);
            } else {
                showArticleDetailPage(slug);
            }
            return;
        }

        // Restore visibility of standard sections
        const heroSection = document.querySelector('.hero-section');
        const bentoSection = document.querySelector('.bento-section');
        const detailSection = document.getElementById('article-detail-section');
        
        if (heroSection) heroSection.style.display = 'block';
        if (bentoSection) bentoSection.style.display = 'block';
        if (detailSection) detailSection.style.display = 'none';

        const routeParams = parseCurrentRoute();
        if (routeParams) {
            currentRegion = routeParams.region;
            currentCategory = routeParams.category;
        }

        // If SSR content exists and it's initial load, skip re-render — just update active tab styles
        if (isInitialLoad && hasSSRContent) {
            console.log('📋 SSR content preserved on initial load');
            // Update tab button active states without re-rendering cards
            try {
                // Highlight region tab
                document.querySelectorAll('.region-tab-btn').forEach(btn => {
                    const btnReg = btn.getAttribute('data-region')?.toLowerCase().trim();
                    const existingDot = btn.querySelector('.active-indicator-dot');
                    if (existingDot) existingDot.remove();
                    if (btnReg === currentRegion) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                        const dot = document.createElement('span');
                        dot.className = 'active-indicator-dot';
                        btn.appendChild(dot);
                    } else {
                        btn.classList.remove('active');
                        btn.setAttribute('aria-pressed', 'false');
                    }
                });
                // Highlight category tab
                document.querySelectorAll('.category-tab-btn').forEach(btn => {
                    const btnCat = btn.getAttribute('data-category')?.toLowerCase();
                    if (btnCat === currentCategory.toLowerCase()) {
                        btn.classList.add('active');
                        btn.setAttribute('aria-pressed', 'true');
                    } else {
                        btn.classList.remove('active');
                        btn.setAttribute('aria-pressed', 'false');
                    }
                });
                bindDynamicEvents();
                if (window.lucide) lucide.createIcons();
            } catch (e) { console.warn('Active state update failed:', e); }
            return;
        }

        // Handle "Our Bias" / Manifesto special case
        if (hash === '#/our-bias' || hash === '#manifesto') {
            document.querySelectorAll('.nav-link').forEach(link => {
                const href = link.getAttribute('href');
                if (href === '#/our-bias' || href === '#manifesto') {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            const manifestoCard = document.getElementById('manifesto');
            if (manifestoCard) {
                manifestoCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // Highlight correct region tab button
        const regionButtons = document.querySelectorAll('.region-tab-btn');
        regionButtons.forEach(btn => {
            const btnReg = btn.getAttribute('data-region').toLowerCase().trim();
            const existingDot = btn.querySelector('.active-indicator-dot');
            if (existingDot) existingDot.remove();
            if (btnReg === currentRegion) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
                const dot = document.createElement('span');
                dot.className = 'active-indicator-dot';
                btn.appendChild(dot);
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            }
        });

        // Highlight correct category tab button in bento grid
        const tabButtons = document.querySelectorAll('.category-tab-btn');
        tabButtons.forEach(btn => {
            const btnCat = btn.getAttribute('data-category');
            if (btnCat.toLowerCase() === currentCategory.toLowerCase()) {
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-pressed', 'false');
            }
        });

        // Dynamically update Section Title & Subtitle based on metadata and region name
        const sectionHeader = document.querySelector('.bento-section .section-header');
        if (sectionHeader) {
            const titleEl = sectionHeader.querySelector('.section-title');
            const subtitleEl = sectionHeader.querySelector('.section-subtitle');
            
            let regionName = 'All';
            if (currentRegion === 'all') regionName = 'Global';
            else if (currentRegion === 'indian') regionName = 'Indian';
            else if (currentRegion === 'world') regionName = 'World';
            else if (currentRegion === 'uk') regionName = 'UK';
            else if (currentRegion === 'berkshire') regionName = 'Berkshire';

            const meta = categoryMetadata[currentCategory] || categoryMetadata['all'];
            
            if (titleEl) {
                titleEl.textContent = (currentRegion === 'all' && currentCategory === 'all')
                    ? "The Ledger"
                    : `${regionName} ${meta.title.includes("Chronicles") ? meta.title : "Chronicles"}`.trim();
            }
            if (subtitleEl) subtitleEl.textContent = meta.subtitle;
        }

        // Render matching articles
        renderArticles(currentRegion, currentCategory);

        // Scroll to Bento Grid section only if explicitly navigated via header click
        if (isHeaderClick) {
            const bentoSection = document.querySelector('.bento-section');
            if (bentoSection) {
                setTimeout(() => {
                    bentoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
            isHeaderClick = false;
        }

        // Sync the premium sliding active indicator pills
        setTimeout(syncActiveIndicators, 60);
    }

    function syncActiveIndicators() {
        // Region active indicator
        const activeRegionBtn = document.querySelector('.region-tab-btn.active');
        const regionPill = document.getElementById('region-active-pill');
        const regionContainer = document.getElementById('region-tabs-container');
        
        if (activeRegionBtn && regionPill && regionContainer) {
            const containerRect = regionContainer.getBoundingClientRect();
            const btnRect = activeRegionBtn.getBoundingClientRect();
            
            const scrollLeft = regionContainer.scrollLeft;
            const leftOffset = btnRect.left - containerRect.left + scrollLeft;
            
            regionPill.style.width = `${btnRect.width}px`;
            regionPill.style.left = `${leftOffset}px`;
            
            const currentReg = activeRegionBtn.getAttribute('data-region').toLowerCase().trim();
            regionPill.className = 'active-indicator-pill ' + 'active-' + currentReg;
        }

        // Category active indicator
        const activeCatBtn = document.querySelector('.category-tab-btn.active');
        const catPill = document.getElementById('category-active-pill');
        const catContainer = document.getElementById('category-tabs-container');
        
        if (activeCatBtn && catPill && catContainer) {
            const containerRect = catContainer.getBoundingClientRect();
            const btnRect = activeCatBtn.getBoundingClientRect();
            const isVertical = window.getComputedStyle(catContainer).flexDirection === 'column';
            
            if (isVertical) {
                const scrollTop = catContainer.scrollTop;
                const topOffset = btnRect.top - containerRect.top + scrollTop;
                
                catPill.style.height = `${btnRect.height}px`;
                catPill.style.top = `${topOffset}px`;
                
                // Clear inline horizontal styles to allow CSS stylesheet to apply (left/width)
                catPill.style.width = '';
                catPill.style.left = '';
            } else {
                const scrollLeft = catContainer.scrollLeft;
                const leftOffset = btnRect.left - containerRect.left + scrollLeft;
                
                catPill.style.width = `${btnRect.width}px`;
                catPill.style.left = `${leftOffset}px`;
                
                // Clear inline vertical styles to allow CSS stylesheet to apply (top/height)
                catPill.style.height = '';
                catPill.style.top = '';
            }
            
            const currentCat = activeCatBtn.getAttribute('data-category').toLowerCase().trim();
            catPill.className = 'active-indicator-pill ' + currentCat;
        }
    }

    // Bind window resize listener to reflow active indicators
    window.addEventListener('resize', syncActiveIndicators);

    function showArticleDetailPage(articleId) {
        let article;
        if (articleId === 'featured-story') {
            article = {
                id: "featured-story",
                category: "Politics",
                aiheadline: "The Illusion of Consensus: Bending the Corporate News Narrative",
                timeago: "Audited Today",
                author: "Aniket Verma",
                authortype: "admin",
                imageurl: "./assets/hero-bg.png",
                originalsource: "Honestly Biased Editorial Board",
                originalurl: "#",
                fullblog: `
                    <p class="blog-lead">Traditional news chambers claim to deliver pure, unvarnished objective truth. We say that is a convenient myth. In a landscape structured by corporate sponsorship and administrative convenience, "neutrality" is rarely neutral.</p>
                    
                    <p>When major broadcast platforms present complex economic policies, they often deploy a performative balance—giving equal weight to corporate lobbyists and affected local communities as if their incentives were identical. This artificial consensus serves to obscure the deep structural inequalities, policy loopholes, and direct corporate influence that shape the legislative process. By framing political concessions as procedural adjustments, the mainstream media actively manufactures consent under the cover of objective reporting.</p>
                    
                    <p class="blog-analysis-heading"><strong>The Honestly Biased Narrative Audit:</strong></p>
                    <blockquote>Media institutions frame corporate policy lobbying as public interest initiatives to protect high-revenue advertisers and preserve regulatory access.</blockquote>
                    
                    <p>To bend the narrative is to reject this performance. We believe in providing transparent, critical media analysis that highlights who benefits from policy shifts, which voices are excluded from the debate, and how legacy press releases are converted into public opinion. Our bias is not hidden; it is our primary lens of analysis.</p>
                    
                    <p>In subsequent editions, we will expand this audit to cover specific legislative files, mapping the flow of consulting capital to media committees and auditing the digital dashboards used by state ministries to frame operational overhead as structural efficiency. Decrypting the script is the first step toward reclaiming public consciousness.</p>
                `
            };
        } else {
            article = allArticles.find(a => String(a.id) === String(articleId));
        }

        if (!article) {
            // Fallback to home if article not found
            window.location.hash = '#/';
            return;
        }

        console.log(`👁️ Routing to full blog page for article: "${article.aiheadline}"`);

        // Hide Hero, Bento grid, and other sections
        const heroSection = document.querySelector('.hero-section');
        const bentoSection = document.querySelector('.bento-section');
        
        if (heroSection) heroSection.style.display = 'none';
        if (bentoSection) bentoSection.style.display = 'none';
        
        // Show detail section
        const detailSection = document.getElementById('article-detail-section');
        if (detailSection) {
            detailSection.style.display = 'block';
            
            // Hydrate detail fields
            const detailCategory = document.getElementById('detail-category');
            const detailTime = document.getElementById('detail-time');
            const detailTitle = document.getElementById('detail-title');
            const detailAuthor = document.querySelector('.detail-author');
            const detailMediaContainer = document.getElementById('detail-media-container');
            const detailContent = document.getElementById('detail-content');
            const detailSource = document.getElementById('detail-source');
            const detailOriginalLink = document.getElementById('detail-original-link');

            // Strip "Refracted: " prefix from headline when displaying
            const rawHeadline = article.aiheadline || article.aiHeadline || article.title || '';
            const cleanedHeadline = rawHeadline.replace(/^Refracted:\s*/i, '');

            if (detailCategory) {
                detailCategory.textContent = article.category;
                detailCategory.className = 'modal-tag ' + (article.category.toLowerCase().trim() === 'tech' ? 'green-bg' : 'saffron-bg');
            }
            if (detailTime) detailTime.innerHTML = `<i data-lucide="clock" style="width: 14px; height: 14px;"></i> ${article.timeago || (article.publishdate ? formatDate(article.publishdate) : '')}`;
            if (detailTitle) detailTitle.textContent = cleanedHeadline;
            
            if (detailAuthor) {
                if (article.authortype === 'admin') {
                    detailAuthor.innerHTML = `<i data-lucide="pen-tool" style="width:16px; height:16px;"></i> The Ledger Desk`;
                    detailAuthor.style.color = 'var(--accent-saffron)';
                } else if (article.authortype === 'instagram') {
                    detailAuthor.innerHTML = `<i data-lucide="instagram" style="width:16px; height:16px;"></i> Honestly Biased AI Engine (Instagram Ingestion)`;
                    detailAuthor.style.color = '#e1306c'; // Instagram Pink
                } else {
                    detailAuthor.innerHTML = `<i data-lucide="shield-check" style="width:16px; height:16px;"></i> Audited by Honestly Biased AI Engine (Gemini)`;
                    detailAuthor.style.color = '#00E5FF'; // Neon Blue
                }
            }

            // Hydrate Media
            if (detailMediaContainer) {
                if (article.authortype === 'instagram' && article.instagramShortcode) {
                    detailMediaContainer.style.display = 'block';
                    detailMediaContainer.innerHTML = `
                        <div class="instagram-embed-wrapper" style="position: relative; width: 100%; max-width: 540px; margin: 0 auto; aspect-ratio: 328/420; background: rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; border: 1px solid rgba(225, 48, 108, 0.3);">
                            <iframe src="https://www.instagram.com/p/${article.instagramShortcode}/embed" 
                                    class="instagram-media instagram-media-rendered" 
                                    allowtransparency="true" 
                                    allowfullscreen="true" 
                                    frameborder="0" 
                                    height="100%" 
                                    scrolling="no" 
                                    style="background: white; border: 0; margin: 0; padding: 0; width: 100%; height: 100%; display: block; min-height: 420px;">
                            </iframe>
                        </div>
                    `;
                } else if (article.imageurl) {
                    detailMediaContainer.style.display = 'block';
                    detailMediaContainer.innerHTML = `
                        <img src="${article.imageurl}" alt="${cleanedHeadline}" style="width: 100%; max-height: 450px; object-fit: cover; border-radius: 8px; border: 1.5px solid var(--border-glass);">
                    `;
                } else {
                    detailMediaContainer.style.display = 'none';
                    detailMediaContainer.innerHTML = '';
                }
            }

            // Hydrate Blog content paragraphs
            if (detailContent) {
                if (article.fullblog) {
                    // Split content by newlines to wrap in paragraphs or render HTML directly if pre-formatted
                    if (article.fullblog.includes('<p>')) {
                        detailContent.innerHTML = article.fullblog;
                    } else {
                        const paras = article.fullblog.split('\n\n').filter(p => p.trim());
                        detailContent.innerHTML = paras.map(p => `<p>${p}</p>`).join('');
                    }
                } else {
                    // Call fallback blog generator
                    detailContent.innerHTML = generateFallbackBlog(article);
                }
            }

            if (detailSource) {
                detailSource.textContent = `Source Attribution: ${article.originalsource || article.originaltitle || article.author || 'Honestly Biased Editorial Board'}`;
            }

            if (detailOriginalLink) {
                detailOriginalLink.href = article.originalurl;
            }

            // Scroll window to top smoothly
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Render Lucide icons
            lucide.createIcons();
        }
    }

    function generateFallbackBlog(article) {
        const rawHeadline = article.aiheadline || article.aiHeadline || article.title || '';
        const cleanedHeadline = rawHeadline.replace(/^Refracted:\s*/i, '');
        return `
            <p class="blog-lead">In a media landscape dominated by corporate spin and sanitised press releases, the core facts of this event deserve an uncompromised audit. Let's peel back the narrative layers surrounding the headline: <strong>"${cleanedHeadline}"</strong>.</p>
            
            <p>${article.aisummary}</p>
            
            <p class="blog-analysis-heading"><strong>The Honestly Biased Audit:</strong></p>
            <blockquote>${article.biasaudit}</blockquote>
            
            <p>What we observe here is not an isolated incident of PR posturing, but a systemic pattern. When institutional power structures or high-tech platforms frame operational hurdles as 'innovation' or 'progress', they are actively manufacturing consent. It is our duty as critical observers to audit these claims, question the underlying incentives, and reject the performative neutrality that dominates mainstream media reporting.</p>
            
            <p>As this situation develops, Honestly Biased will continue tracking the policy shifts, corporate lobbying, and economic pressures that shape the final outcome. Stay tuned for further updates as our AI and editorial desks decode the next cycle of press coverage.</p>
        `;
    }

    // Pagination UI update function
    function updatePaginationUI() {
        const pageIndicator = document.getElementById('page-indicator');
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        
        if (pageIndicator) {
            pageIndicator.textContent = `${currentPage} / ${totalPages}`;
        }
        
        if (prevBtn) {
            const prevPage = Math.max(1, currentPage - 1);
            prevBtn.href = `/?page=${prevPage}`;
            prevBtn.setAttribute('aria-disabled', currentPage <= 1 ? 'true' : 'false');
            prevBtn.disabled = currentPage <= 1;
            prevBtn.style.opacity = currentPage <= 1 ? '0.4' : '1';
            prevBtn.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
        }
        
        if (nextBtn) {
            const nextPage = Math.min(totalPages, currentPage + 1);
            nextBtn.href = `/?page=${nextPage}`;
            nextBtn.setAttribute('aria-disabled', currentPage >= totalPages ? 'true' : 'false');
            nextBtn.disabled = currentPage >= totalPages;
            nextBtn.style.opacity = currentPage >= totalPages ? '0.4' : '1';
            nextBtn.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
        }
    }

    // Pagination event listeners
    const perPageSelect = document.getElementById('per-page-select');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    
    if (perPageSelect) {
        perPageSelect.addEventListener('change', () => {
            itemsPerPage = parseInt(perPageSelect.value);
            currentPage = 1; // Reset to first page
            const route = parseCurrentRoute();
            updateUrlState(route.region, route.category, 1);
            renderArticles(route.region, route.category);
        });
    }

    // Live search listener on Ledger search input
    const searchInput = document.getElementById('ledger-search-input');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentSearchQuery = e.target.value.trim();
                currentPage = 1;
                const route = parseCurrentRoute();
                renderArticles(route.region, route.category);
            }, 200);
        });
    }
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                const route = parseCurrentRoute();
                updateUrlState(route.region, route.category, currentPage);
                renderArticles(route.region, route.category);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentPage++;
                const route = parseCurrentRoute();
                updateUrlState(route.region, route.category, currentPage);
                renderArticles(route.region, route.category);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    // Set up router event listeners for clean path history and legacy hash navigation
    window.addEventListener('popstate', () => handleRouting(false));
    window.addEventListener('hashchange', () => handleRouting(false));

    // Run initial routing on page load (clean crawlable routes preserved)
    handleRouting(true);

    // Initialize reading progress bar scroll listener
    window.addEventListener('scroll', function() {
        const progressBar = document.getElementById('read-progress-bar');
        if (progressBar) {
            const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
            progressBar.style.width = scrolled + '%';
        }
    }, { passive: true });

    // Initialize fetching routine
    loadDynamicArticles();

    console.log('Honestly Biased Core Platform Logic initialized successfully. Grid observers, forms and interactive voting channels fully functional.');
});
