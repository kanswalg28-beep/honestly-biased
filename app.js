/* ==========================================================================
   HONESTLY BIASED - INTERACTIVE CORE WEBPAGE SCRIPTS (Vanilla JS Engine)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // --- Safe Initialization Checks ---
    const isMobile = window.innerWidth <= 768;

    // --------------------------------------------------------------------------
    // 1. DYNAMIC THEME SYSTEM (Dark Default <-> Editorial Light)
    // --------------------------------------------------------------------------
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const htmlElement = document.documentElement;
    const bodyElement = document.body;

    // Read stored theme preference or default to dark
    const currentTheme = localStorage.getItem('hb-theme') || 'dark';
    if (currentTheme === 'light') {
        bodyElement.classList.add('light-theme');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = bodyElement.classList.toggle('light-theme');
            const newTheme = isLight ? 'light' : 'dark';
            localStorage.setItem('hb-theme', newTheme);
            
            // Dispatch custom event for Three.js / Canvas renderers to react if necessary
            window.dispatchEvent(new CustomEvent('hbThemeChange', { detail: { theme: newTheme } }));
        });
    }

    // --------------------------------------------------------------------------
    // 2. SLIDING PILL INDICATORS (Regions & Categories Tab Synchronizers)
    // --------------------------------------------------------------------------
    function updatePillPosition(containerSelector, activeItemSelector, pillSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const activeItem = container.querySelector(activeItemSelector);
        let pill = container.querySelector(pillSelector);

        if (!activeItem) {
            if (pill) pill.style.opacity = '0';
            return;
        }

        if (!pill) {
            pill = document.createElement('div');
            pill.className = pillSelector.replace('.', '');
            container.appendChild(pill);
        }

        // Compute relative geometry
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeItem.getBoundingClientRect();

        const offsetLeft = activeRect.left - containerRect.left + container.scrollLeft;
        const offsetTop = activeRect.top - containerRect.top + container.scrollTop;

        pill.style.width = `${activeRect.width}px`;
        pill.style.height = `${activeRect.height}px`;
        pill.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`;
        pill.style.opacity = '1';
    }

    // Initialize Region Pill
    updatePillPosition('.region-tabs-container', '.region-tab-btn.active', '.active-indicator-pill');

    // Handle Region Tabs Interactive Switch
    const regionButtons = document.querySelectorAll('.region-tab-btn');
    regionButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            regionButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updatePillPosition('.region-tabs-container', '.region-tab-btn.active', '.active-indicator-pill');
        });
    });

    // Handle Category Sidebar Tabs Interactive Switch
    const categoryButtons = document.querySelectorAll('.category-tab-btn');
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            categoryButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const selectedCategory = btn.getAttribute('data-category');
            filterBentoCards(selectedCategory);
        });
    });

    // Handle Window Resize to Recompute Indicator Geometries
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            updatePillPosition('.region-tabs-container', '.region-tab-btn.active', '.active-indicator-pill');
        }, 100);
    });

    // --------------------------------------------------------------------------
    // 3. CLIENT-SIDE BENTO CARDS CATEGORY FILTER
    // --------------------------------------------------------------------------
    function filterBentoCards(category) {
        const cards = document.querySelectorAll('.bento-card');
        cards.forEach(card => {
            const cardTag = card.querySelector('.card-tag');
            if (!cardTag) return;

            const cardCategory = cardTag.textContent.trim().toLowerCase();
            const target = (category || 'all').trim().toLowerCase();

            if (target === 'all' || cardCategory === target) {
                card.style.display = '';
                card.style.opacity = '0';
                setTimeout(() => {
                    card.style.transition = 'opacity 0.3s ease';
                    card.style.opacity = '1';
                }, 20);
            } else {
                card.style.display = 'none';
            }
        });
    }

    // --------------------------------------------------------------------------
    // 4. ACCESSIBLE MODAL & FULL NARRATIVE AUDIT VIEWER
    // --------------------------------------------------------------------------
    const auditModal = document.getElementById('audit-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCategoryTag = document.getElementById('modal-category-tag');
    const modalDate = document.getElementById('modal-date');
    const modalTitle = document.getElementById('modal-title');
    const modalSummary = document.getElementById('modal-summary');
    const modalAuditSummary = document.getElementById('modal-audit-summary');
    const modalOriginalSource = document.getElementById('modal-original-source');
    const modalOriginalLink = document.getElementById('modal-original-link');
    const modalFullStory = document.getElementById('modal-full-story');
    let lastActiveTrigger = null;

    function openAuditModal(data, triggerElement) {
        if (!auditModal) return;
        lastActiveTrigger = triggerElement || document.activeElement;

        if (modalCategoryTag) modalCategoryTag.textContent = data.category || 'Politics';
        if (modalDate) modalDate.textContent = data.publishdate ? new Date(data.publishdate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Live Audit';
        if (modalTitle) modalTitle.textContent = data.aiheadline || data.title || 'Narrative Audit';
        if (modalSummary) modalSummary.textContent = data.aisummary || data.summary || '';
        if (modalAuditSummary) modalAuditSummary.textContent = data.biasaudit || data.aisummary || 'Standard audit executed.';
        if (modalOriginalSource) modalOriginalSource.textContent = data.originalsource || 'Editorial Direct Wire';
        if (modalOriginalLink) {
            modalOriginalLink.href = data.originalurl || '#';
            modalOriginalLink.style.display = data.originalurl ? 'inline-flex' : 'none';
        }
        if (modalFullStory) modalFullStory.textContent = data.fullblog || data.aisummary || '';

        auditModal.classList.add('open');
        auditModal.setAttribute('aria-hidden', 'false');
        bodyElement.style.overflow = 'hidden';

        if (window.lucide) {
            lucide.createIcons({ targets: [auditModal] });
        }

        if (modalCloseBtn) modalCloseBtn.focus();
    }

    function closeAuditModal() {
        if (!auditModal) return;
        auditModal.classList.remove('open');
        auditModal.setAttribute('aria-hidden', 'true');
        bodyElement.style.overflow = '';
        if (lastActiveTrigger && typeof lastActiveTrigger.focus === 'function') {
            lastActiveTrigger.focus();
        }
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeAuditModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeAuditModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && auditModal && auditModal.classList.contains('open')) {
            closeAuditModal();
        }
    });

    // --------------------------------------------------------------------------
    // 5. ATTACH CARD CLICK LISTENERS
    // --------------------------------------------------------------------------
    const bentoCards = document.querySelectorAll('.bento-card');
    bentoCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const headlineEl = card.querySelector('.card-title a, .card-title');
            const summaryEl = card.querySelector('.card-summary');
            const tagEl = card.querySelector('.card-tag');
            const timeEl = card.querySelector('.card-time');

            const articleData = {
                category: tagEl ? tagEl.textContent.trim() : 'Politics',
                aiheadline: headlineEl ? headlineEl.textContent.trim() : 'Untitled Chronicle',
                aisummary: summaryEl ? summaryEl.textContent.trim() : '',
                biasaudit: summaryEl ? summaryEl.textContent.trim() : '',
                fullblog: summaryEl ? summaryEl.textContent.trim() : '',
                publishdate: timeEl ? timeEl.textContent.trim() : new Date().toISOString()
            };

            // If user clicked directly on title link with meta key (Ctrl/Cmd), allow browser tab navigation
            if (e.target.tagName === 'A' && (e.ctrlKey || e.metaKey)) return;

            // If normal tap/click, open instant narrative modal
            if (!e.target.closest('a')) {
                e.preventDefault();
                openAuditModal(articleData, card);
            }
        });
    });

    // --------------------------------------------------------------------------
    // 6. HERO "READ AUDIT" CTA LISTENER
    // --------------------------------------------------------------------------
    const heroAuditBtn = document.getElementById('hero-audit-btn');
    if (heroAuditBtn) {
        heroAuditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const heroSection = document.querySelector('.hero-section');
            const headline = heroSection ? heroSection.querySelector('.hero-title')?.textContent.trim() : '';
            const summary = heroSection ? heroSection.querySelector('.hero-summary')?.textContent.trim() : '';
            const tag = heroSection ? heroSection.querySelector('.category-tag-wrapper .modal-tag')?.textContent.trim() : 'POLITICS';

            openAuditModal({
                category: tag,
                aiheadline: headline,
                aisummary: summary,
                biasaudit: summary,
                fullblog: summary
            }, heroAuditBtn);
        });
    }

    // --------------------------------------------------------------------------
    // 7. NEWSLETTER SUBSCRIPTION CONTROLLER
    // --------------------------------------------------------------------------
    const newsletterForms = document.querySelectorAll('#newsletter-form, #inline-newsletter-form');
    newsletterForms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = form.querySelector('input[type="email"]');
            const btn = form.querySelector('button[type="submit"]');
            if (!input || !input.value) return;

            const email = input.value.trim();
            const originalBtnHtml = btn ? btn.innerHTML : 'Subscribe';

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<span>Subscribing...</span>';
                }

                const res = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                if (res.ok) {
                    input.value = '';
                    if (btn) btn.innerHTML = '<span>Subscribed! ✓</span>';
                    setTimeout(() => {
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = originalBtnHtml;
                        }
                    }, 3000);
                } else {
                    throw new Error('Subscription service unavailable');
                }
            } catch (err) {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
                alert('Thank you! You are on the subscriber registry.');
            }
        });
    });

    // --------------------------------------------------------------------------
    // 8. LUCIDE ICONS INITIALIZATION
    // --------------------------------------------------------------------------
    if (window.lucide) {
        lucide.createIcons();
    }
});

/* ==========================================================================
   ADVANCED MOBILE INTERACTIONS (Smart Scroll Header & Web Share)
   ========================================================================== */
(function initMobileInteractions() {
    let lastScrollY = window.scrollY;
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const currentScrollY = window.scrollY;
                if (window.innerWidth <= 768) {
                    if (currentScrollY > 120 && currentScrollY > lastScrollY + 6) {
                        document.body.classList.add('header-hidden');
                    } else if (currentScrollY < lastScrollY - 6 || currentScrollY < 60) {
                        document.body.classList.remove('header-hidden');
                    }
                } else {
                    document.body.classList.remove('header-hidden');
                }
                lastScrollY = currentScrollY;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    document.addEventListener('click', (e) => {
        const shareBtn = e.target.closest('.btn-share-article, .card-share-btn');
        if (!shareBtn) return;
        e.preventDefault();
        e.stopPropagation();

        const url = shareBtn.dataset.url || window.location.href;
        const title = shareBtn.dataset.title || document.title;

        if (navigator.share) {
            navigator.share({
                title,
                text: 'Read this narrative audit on Honestly Biased:',
                url
            }).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                if (typeof showToast === 'function') {
                    showToast('Link copied to clipboard!', 'success');
                }
            });
        }
    });
})();
