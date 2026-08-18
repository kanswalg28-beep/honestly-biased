document.addEventListener('DOMContentLoaded', () => {
    function getCsrfToken() {
        const meta = document.getElementById('csrf-token');
        return meta ? meta.content : '';
    }

    function setCsrfToken(token) {
        const meta = document.getElementById('csrf-token');
        if (meta) meta.content = token;
    }

    async function fetchCsrfToken() {
        try {
            const res = await fetch('/api/admin/auth?type=csrf');
            if (res.ok) {
                const data = await res.json();
                setCsrfToken(data.token);
            }
        } catch (e) {
            try {
                const res2 = await fetch('/api/admin/csrf-token');
                if (res2.ok) {
                    const data = await res2.json();
                    setCsrfToken(data.token);
                }
            } catch (e2) {
                console.warn('CSRF token fetch failed:', e2);
            }
        }
    }

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss">&times;</button>
        `;
        container.appendChild(toast);
        
        requestAnimationFrame(() => toast.classList.add('toast-show'));
        
        const timer = setTimeout(() => dismissToast(toast), duration);
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            clearTimeout(timer);
            dismissToast(toast);
        });
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
        return container;
    }

    function dismissToast(toast) {
        toast.classList.remove('toast-show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function generateSlug(headline) {
        if (!headline) return '';
        return headline
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .trim()
            .split(/\s+/)
            .slice(0, 4)
            .join('-');
    }

    function setLoading(button, loading = true) {
        if (!button) return;
        if (loading) {
            button.dataset.originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="spin" style="width:16px;height:16px;margin-right:8px;"></i> Working...';
            lucide.createIcons();
        } else {
            button.disabled = false;
            button.innerHTML = button.dataset.originalText || button.innerHTML;
            lucide.createIcons();
        }
    }

    let allArticles = [];
    let searchFilterQuery = "";

    let currentPage = 1;
    let pageSize = 22;
    let totalPages = 1;
    let totalArticles = 0;
    let currentSortBy = 'publishdate';
    let currentSortOrder = 'desc';

    const adminArticlesList = document.getElementById('admin-articles-list');
    const cmsArticleForm = document.getElementById('cms-article-form');
    const searchInput = document.getElementById('cms-search');

    const adminPerPageSelect = document.getElementById('admin-per-page-select');
    const adminPrevPageBtn = document.getElementById('admin-prev-page');
    const adminNextPageBtn = document.getElementById('admin-next-page');
    const adminPageIndicator = document.getElementById('admin-page-indicator');

    const statTotal = document.getElementById('stat-total');
    const statEditorial = document.getElementById('stat-editorial');
    const statAi = document.getElementById('stat-ai');
    const statCategories = document.getElementById('stat-categories');

    const cmsArticleId = document.getElementById('cms-article-id');
    const cmsCategory = document.getElementById('cms-category');
    const cmsRegion = document.getElementById('cms-region');
    const cmsSource = document.getElementById('cms-source');
    const cmsHeadline = document.getElementById('cms-headline');
    const cmsBiasAudit = document.getElementById('cms-bias-audit');
    const cmsSummary = document.getElementById('cms-summary');
    const cmsFullBlog = document.getElementById('cms-full-blog');
    const cmsImageUrl = document.getElementById('cms-image-url');
    const cmsOriginalUrl = document.getElementById('cms-original-url');
    const cmsPreviewImg = document.getElementById('cms-preview-img');
    const cmsPublishDate = document.getElementById('cms-publish-date');

    const cmsImageUpload = document.getElementById('cms-image-upload');
    const cmsImageUploadBtn = document.getElementById('cms-image-upload-btn');
    const cmsImageUploadStatus = document.getElementById('cms-image-upload-status');

    const cmsFormTitle = document.getElementById('cms-form-title');
    const cmsFormSubtitle = document.getElementById('cms-form-subtitle');
    const btnCmsSubmit = document.getElementById('btn-cms-submit');
    const btnCmsReset = document.getElementById('btn-cms-reset');

    const heroForm = document.getElementById('cms-hero-form');
    const heroEyebrow = document.getElementById('hero-eyebrow');
    const heroReadtime = document.getElementById('hero-readtime');
    const heroHeadline = document.getElementById('hero-headline');
    const heroBody = document.getElementById('hero-body');
    const heroByline = document.getElementById('hero-byline');
    const heroBylineRole = document.getElementById('hero-byline-role');
    const heroCta = document.getElementById('hero-cta');
    const heroImageUrl = document.getElementById('hero-image-url');
    const heroImageUpload = document.getElementById('hero-image-upload');
    const heroImageUploadBtn = document.getElementById('hero-image-upload-btn');
    const heroImageUploadStatus = document.getElementById('hero-image-upload-status');
    const heroPreviewImg = document.getElementById('hero-preview-img');

    const highlightsForm = document.getElementById('cms-highlights-form');
    const highlightsInput = document.getElementById('cms-highlights-input');
    const btnHighlightsSubmit = document.getElementById('btn-highlights-submit');

    const subscribersList = document.getElementById('subscribers-list');
    const subCountBadge = document.getElementById('sub-count-badge');
    const btnExportSubscribers = document.getElementById('btn-export-subscribers');

    const sortBySelect = document.getElementById('cms-sort-by');
    const sortOrderSelect = document.getElementById('cms-sort-order');

    async function uploadImageToServer(file, statusEl, btnEl) {
        const validation = validateImageFile(file);
        if (!validation.valid) {
            showUploadStatus(statusEl, validation.error, 'error');
            return null;
        }

        showUploadStatus(statusEl, `Uploading ${file.name}...`, 'info');
        if (btnEl) btnEl.classList.add('uploading');

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/api/admin/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': getCsrfToken()
                },
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Upload failed');
            }

            const data = await res.json();
            showUploadStatus(statusEl, `Uploaded: ${data.url}`, 'success');
            if (btnEl) btnEl.classList.remove('uploading');
            return data.url;
        } catch (error) {
            console.error('Image upload error:', error);
            showUploadStatus(statusEl, error.message, 'error');
            if (btnEl) btnEl.classList.remove('uploading');
            return null;
        }
    }

    function validateImageFile(file, maxSizeMB = 2) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Only JPEG, PNG, WebP, and GIF images are allowed.' };
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
            return { valid: false, error: `Image must be smaller than ${maxSizeMB}MB.` };
        }
        return { valid: true };
    }

    function showUploadStatus(statusEl, message, type) {
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = 'file-upload-status ' + type;
    }

    function setupFileUpload(uploadInput, uploadBtn, statusEl, previewImg, urlInput) {
        if (!uploadInput || !uploadBtn) return;

        uploadBtn.addEventListener('click', () => uploadInput.click());

        uploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const url = await uploadImageToServer(file, statusEl, uploadBtn);
                if (url) {
                    if (previewImg) previewImg.src = url;
                    if (urlInput) urlInput.value = url;
                }
            }
        });

        if (previewImg && previewImg.parentElement) {
            const wrapper = previewImg.parentElement;
            wrapper.addEventListener('dragover', (e) => {
                e.preventDefault();
                wrapper.style.borderColor = 'var(--accent-cyan)';
                wrapper.style.background = 'rgba(0, 229, 255, 0.05)';
            });
            wrapper.addEventListener('dragleave', () => {
                wrapper.style.borderColor = '';
                wrapper.style.background = '';
            });
            wrapper.addEventListener('drop', async (e) => {
                e.preventDefault();
                wrapper.style.borderColor = '';
                wrapper.style.background = '';
                const file = e.dataTransfer.files[0];
                if (file) {
                    uploadInput.files = e.dataTransfer.files;
                    const url = await uploadImageToServer(file, statusEl, uploadBtn);
                    if (url) {
                        if (previewImg) previewImg.src = url;
                        if (urlInput) urlInput.value = url;
                    }
                }
            });
        }
    }

    function setupUrlSync(urlInput, previewImg) {
        if (!urlInput) return;
        urlInput.addEventListener('input', () => {
            const url = urlInput.value.trim();
            if (previewImg) previewImg.src = url || "./assets/hero-bg.png";
        });
        if (previewImg) {
            previewImg.addEventListener('error', () => {
                previewImg.src = "./assets/hero-bg.png";
            });
        }
    }

    setupFileUpload(cmsImageUpload, cmsImageUploadBtn, cmsImageUploadStatus, cmsPreviewImg, cmsImageUrl);
    setupFileUpload(heroImageUpload, heroImageUploadBtn, heroImageUploadStatus, heroPreviewImg, heroImageUrl);
    setupUrlSync(cmsImageUrl, cmsPreviewImg);
    setupUrlSync(heroImageUrl, heroPreviewImg);

    async function apiRequest(path, options = {}) {
        const csrf = getCsrfToken();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        if (csrf) headers['X-CSRF-Token'] = csrf;

        const res = await fetch(path, {
            ...options,
            headers
        });

        if (res.status === 401) {
            showToast('Session expired. Please refresh the page.', 'error');
            setTimeout(() => window.location.reload(), 2000);
            throw new Error('Unauthorized');
        }

        return res;
    }

    async function loadCMSData() {
        console.log("📡 Fetching CMS articles for hydration...");
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch('/api/admin/articles?limit=2000&_t=' + Date.now(), {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    allArticles = data;
                } else {
                    allArticles = data.articles || [];
                }
                updateStatsMetrics();
                populateManagerList();
            } else {
                console.error("Failed to load CMS articles:", response.status);
                showToast('Failed to load articles', 'error');
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("CMS could not connect to server:", error);
                showToast('Cannot connect to server', 'error');
            }
        }
    }

    function updateStatsMetrics() {
        if (!allArticles) return;
        const total = allArticles.length;
        const customCount = allArticles.filter(a => a.authortype === 'admin').length;
        const aiCount = allArticles.filter(a => a.authortype === 'ai' || a.authortype === 'instagram').length;
        const categoriesSeen = new Set();
        allArticles.forEach(a => { if (a.category) categoriesSeen.add(a.category.toLowerCase().trim()); });
        animateCounter(statTotal, total);
        animateCounter(statEditorial, customCount);
        animateCounter(statAi, aiCount);
        animateCounter(statCategories, categoriesSeen.size);
    }

    function animateCounter(element, targetValue) {
        if (!element) return;
        element.textContent = targetValue;
    }

    function populateManagerList() {
        if (!adminArticlesList) return;
        adminArticlesList.innerHTML = '';

        const query = searchFilterQuery.toLowerCase().trim();
        const filtered = allArticles.filter(article => {
            const matchHeadline = article.aiheadline && article.aiheadline.toLowerCase().includes(query);
            const matchSource = article.originalsource && article.originalsource.toLowerCase().includes(query);
            const matchCategory = article.category && article.category.toLowerCase().includes(query);
            const matchAuthor = article.author && article.author.toLowerCase().includes(query);
            return matchHeadline || matchSource || matchCategory || matchAuthor;
        });

        totalArticles = filtered.length;
        totalPages = Math.ceil(totalArticles / pageSize);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * pageSize;
        const endIdx = startIdx + pageSize;
        const paginatedArticles = filtered.slice(startIdx, endIdx);

        if (paginatedArticles.length === 0) {
            adminArticlesList.innerHTML = `
                <div style="padding: 64px 24px; text-align: center; color: var(--text-muted);">
                    <i data-lucide="search-code" style="width: 44px; height: 44px; margin-bottom: 16px; color: var(--accent-saffron); opacity: 0.7;"></i>
                    <h3 style="font-family:var(--font-heading); font-size:1.1rem; color:var(--text-primary); margin-bottom:6px;">No chronicles matched criteria</h3>
                    <p style="font-size: 0.8rem; max-width: 320px; margin: 0 auto;">Refine your search parameters or write a fresh custom editorial draft.</p>
                </div>
            `;
            lucide.createIcons();
            updatePaginationUI();
            return;
        }

        paginatedArticles.forEach(article => {
            const card = document.createElement('div');
            card.className = 'admin-card-row';

            let badgeClass = 'badge-ai';
            let badgeText = '🤖 AI Audited';
            if (article.authortype === 'admin') {
                badgeClass = 'badge-admin';
                badgeText = '✍️ Editorial';
            } else if (article.authortype === 'instagram') {
                badgeClass = 'badge-instagram';
                badgeText = '🎥 IG Video';
            }

            const cardImageUrl = article.imageurl || article.imageUrl || "./assets/hero-bg.png";
            const headline = article.aiheadline || article.aiHeadline || article.title || "Untitled Chronicle";

            let regionBadge = '🇮🇳 Indian';
            if (article.region === 'world') regionBadge = '🌐 World';
            else if (article.region === 'uk') regionBadge = '🇬🇧 UK';
            else if (article.region === 'berkshire') regionBadge = '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Berkshire';

            card.innerHTML = `
                <div class="admin-row-thumb" style="background-image: url('${escapeHtml(cardImageUrl)}')">
                    <span class="admin-row-tag">${escapeHtml(article.category || 'General')}</span>
                </div>
                
                <div class="admin-row-body">
                    <h3 class="admin-row-title">${escapeHtml(headline)}</h3>
                    
                    <div class="admin-row-meta">
                        <span class="author-type-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
                        <span class="author-type-badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary); border: 1px solid var(--border-glass);">${escapeHtml(regionBadge)}</span>
                        <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> ${escapeHtml(article.originalsource || article.originalSource || 'Honestly Biased')}</span>
                        <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(article.timeago || article.timeAgo || 'Just now')}</span>
                    </div>
                </div>
                
                <div class="admin-row-actions">
                    <button class="btn-action act-edit" data-id="${escapeHtml(article.id)}" title="Refine Satirical Text">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button class="btn-action act-delete" data-id="${escapeHtml(article.id)}" title="Permanently Scrub News Card">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            `;
            adminArticlesList.appendChild(card);
        });

        if (window.lucide && window.lucide.createIcons) {
            lucide.createIcons();
        }

        adminArticlesList.querySelectorAll('.act-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const article = allArticles.find(a => String(a.id) === String(id));
                if (article) {
                    loadArticleForEdit(id);
                }
            });
        });

        adminArticlesList.querySelectorAll('.act-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const id = btn.getAttribute('data-id');
                const article = allArticles.find(a => String(a.id) === String(id));
                if (!article) return;

                const articleTitle = article.aiheadline || article.aiHeadline || article.title || "this article";
                if (confirm(`Scrub and erase "${articleTitle}" permanently from the database cache?`)) {
                    try {
                        const response = await apiRequest(`/api/admin/articles/${id}`, {
                            method: 'DELETE'
                        });

                        if (response.ok) {
                            console.log(`🗑️ Successfully deleted article ID: ${id}`);
                            allArticles = allArticles.filter(a => String(a.id) !== String(id));
                            updateStatsMetrics();
                            populateManagerList();
                            showToast('Article erased from inventory', 'success');

                            if (cmsArticleId && cmsArticleId.value === String(id)) {
                                cancelEditMode();
                            }
                        } else {
                            const errData = await response.json().catch(() => ({}));
                            showToast(`Failed to delete: ${errData.error || 'Server error'}`, 'error');
                        }
                    } catch (err) {
                        if (err.message !== 'Unauthorized') {
                            console.error("Delete CMS request failed:", err);
                            showToast("Cannot connect to backend server.", 'error');
                        }
                    }
                }
            });
        });

        updatePaginationUI();
    }

    function updatePaginationUI() {
        if (adminPageIndicator) {
            adminPageIndicator.textContent = `${currentPage} / ${totalPages}`;
        }

        if (adminPrevPageBtn) {
            adminPrevPageBtn.disabled = currentPage <= 1;
            adminPrevPageBtn.style.opacity = currentPage <= 1 ? '0.4' : '1';
            adminPrevPageBtn.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
        }

        if (adminNextPageBtn) {
            adminNextPageBtn.disabled = currentPage >= totalPages;
            adminNextPageBtn.style.opacity = currentPage >= totalPages ? '0.4' : '1';
            adminNextPageBtn.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
        }

        const oldContainer = document.getElementById('pagination-container');
        if (oldContainer) {
            oldContainer.remove();
        }
    }

    async function loadArticleForEdit(id) {
        const article = allArticles.find(a => String(a.id) === String(id));
        if (!article) return;

        cmsArticleId.value = article.id;
        cmsCategory.value = article.category;
        cmsRegion.value = article.region || 'indian';
        cmsSource.value = article.originalsource || '';
        cmsHeadline.value = article.aiheadline;
        cmsBiasAudit.value = article.biasaudit;
        cmsSummary.value = article.aisummary;
        if (cmsFullBlog) cmsFullBlog.value = article.fullblog || '';
        cmsImageUrl.value = article.imageurl || '';
        cmsOriginalUrl.value = article.originalurl || '';
        
        if (cmsPublishDate && article.publishdate) {
            const d = new Date(article.publishdate);
            const pad = n => String(n).padStart(2, '0');
            cmsPublishDate.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else if (cmsPublishDate) {
            cmsPublishDate.value = '';
        }

        cmsPreviewImg.src = article.imageurl || "./assets/hero-bg.png";
        if (cmsImageUploadStatus) {
            cmsImageUploadStatus.textContent = '';
            cmsImageUploadStatus.className = 'file-upload-status';
        }

        cmsFormTitle.textContent = "Refine News Chronicle";
        cmsFormSubtitle.textContent = "Refine satirical headlines, critical summaries or narrative bias audits.";
        btnCmsSubmit.textContent = "Save Changes";
        btnCmsReset.style.display = "inline-flex";
        
        document.querySelector('.cms-grid').scrollIntoView({ behavior: 'smooth' });
    }

    async function deleteArticle(id) {
        const article = allArticles.find(a => String(a.id) === String(id));
        if (!article) return;

        if (!confirm(`Scrub and erase "${article.aiheadline}" permanently from the database cache?`)) return;

        try {
            const res = await apiRequest(`/api/admin/articles/${id}`, { method: 'DELETE' });
            
            if (res.ok) {
                showToast('Article deleted', 'success');
                allArticles = allArticles.filter(a => String(a.id) !== String(id));
                updateStatsMetrics();
                populateManagerList();
                if (cmsArticleId.value === String(id)) cancelEditMode();
            } else {
                showToast('Failed to delete article', 'error');
            }
        } catch (err) {
            console.error("Delete failed:", err);
            if (err.message !== 'Unauthorized') showToast('Cannot connect to server', 'error');
        }
    }

    function cancelEditMode() {
        if (cmsArticleForm) cmsArticleForm.reset();
        if (cmsArticleId) cmsArticleId.value = '';
        if (cmsFullBlog) cmsFullBlog.value = '';
        if (cmsPublishDate) cmsPublishDate.value = '';
        cmsPreviewImg.src = "./assets/hero-bg.png";
        if (cmsImageUploadStatus) {
            cmsImageUploadStatus.textContent = '';
            cmsImageUploadStatus.className = 'file-upload-status';
        }
        cmsFormTitle.textContent = "Draft Custom Editorial";
        cmsFormSubtitle.textContent = "Write an opinionated editorial that unshifts to the very front of the ledger.";
        btnCmsSubmit.textContent = "Publish Editorial";
        btnCmsReset.style.display = "none";
    }

    if (cmsArticleForm) {
        cmsArticleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(btnCmsSubmit, true);

            const id = cmsArticleId.value;
            const payload = {
                category: cmsCategory.value,
                region: cmsRegion.value,
                originalsource: cmsSource.value || "Honestly Biased Editorial Board",
                aiheadline: cmsHeadline.value,
                biasaudit: cmsBiasAudit.value,
                aisummary: cmsSummary.value,
                fullblog: cmsFullBlog ? cmsFullBlog.value : "",
                imageurl: cmsImageUrl.value || "./assets/hero-bg.png",
                originalurl: cmsOriginalUrl.value || "#",
                slug: generateSlug(cmsHeadline.value),
                publishdate: cmsPublishDate && cmsPublishDate.value ? new Date(cmsPublishDate.value).toISOString() : null
            };

            try {
                const path = id ? `/api/admin/articles/${id}` : '/api/admin/articles';
                const method = id ? 'PUT' : 'POST';
                const res = await apiRequest(path, { method, body: JSON.stringify(payload) });

                if (res.ok) {
                    const saved = await res.json();
                    showToast(id ? 'Article updated' : 'Article published', 'success');
                    
                    if (id) {
                        const idx = allArticles.findIndex(a => String(a.id) === String(id));
                        if (idx !== -1) allArticles[idx] = { ...allArticles[idx], ...saved };
                    } else {
                        allArticles.unshift(saved);
                    }
                    cancelEditMode();
                    updateStatsMetrics();
                    populateManagerList();
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Failed to save article', 'error');
                }
            } catch (err) {
                console.error("Submit failed:", err);
                if (err.message !== 'Unauthorized') showToast('Cannot connect to server', 'error');
            } finally {
                setLoading(btnCmsSubmit, false);
            }
        });
    }

    if (btnCmsReset) btnCmsReset.addEventListener('click', cancelEditMode);

    if (heroForm) {
        heroForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-hero-submit');
            setLoading(btn, true);

            const payload = {
                updates: [{
                    key: 'hero',
                    value: {
                        eyebrow: heroEyebrow.value,
                        readtime: heroReadtime.value,
                        headline: heroHeadline.value,
                        body: heroBody.value,
                        byline: heroByline.value,
                        byline_role: heroBylineRole.value,
                        cta: heroCta.value,
                        image: heroImageUrl.value
                    }
                }]
            };

            try {
                const res = await apiRequest('/api/admin/site-content', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Hero article updated', 'success');
                    await loadHeroContent();
                } else {
                    showToast('Failed to save hero content', 'error');
                }
            } catch (err) {
                if (err.message !== 'Unauthorized') showToast('Cannot connect to server', 'error');
            } finally {
                setLoading(btn, false);
            }
        });
    }

    async function loadHeroContent() {
        if (!heroForm) return;
        try {
            const res = await fetch('/api/site-content?_t=' + Date.now());
            if (res.ok) {
                const content = await res.json();
                const hero = content.hero || {};
                if (heroEyebrow) heroEyebrow.value = hero.eyebrow || '';
                if (heroReadtime) heroReadtime.value = hero.readtime || '';
                if (heroHeadline) heroHeadline.value = hero.headline || '';
                if (heroBody) heroBody.value = hero.body || '';
                if (heroByline) heroByline.value = hero.byline || '';
                if (heroBylineRole) heroBylineRole.value = hero.byline_role || '';
                if (heroCta) heroCta.value = hero.cta || '';
                if (heroImageUrl) heroImageUrl.value = hero.image || './assets/hero-bg.png';
                if (heroPreviewImg) heroPreviewImg.src = hero.image || './assets/hero-bg.png';
            }
        } catch (e) {
            console.error("Failed to load hero content:", e);
        }
    }

    if (highlightsForm) {
        highlightsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            setLoading(btnHighlightsSubmit, true);

            const rawText = highlightsInput.value;
            const highlightsArray = rawText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (highlightsArray.length === 0) {
                showToast('Please enter at least one highlight', 'error');
                setLoading(btnHighlightsSubmit, false);
                return;
            }

            try {
                const res = await apiRequest('/api/admin/highlights', {
                    method: 'POST',
                    body: JSON.stringify({ highlights: highlightsArray })
                });
                if (res.ok) {
                    showToast('Highlights saved', 'success');
                    await loadHighlightsConfig();
                } else {
                    showToast('Failed to save highlights', 'error');
                }
            } catch (err) {
                if (err.message !== 'Unauthorized') showToast('Cannot connect to server', 'error');
            } finally {
                setLoading(btnHighlightsSubmit, false);
            }
        });
    }

    async function loadHighlightsConfig() {
        try {
            const res = await fetch('/api/admin/highlights');
            if (res.ok) {
                const highlights = await res.json();
                if (highlightsInput) highlightsInput.value = highlights.join('\n');
            }
        } catch (error) {
            console.error("Failed to load highlights:", error);
        }
    }

    async function loadSubscribers() {
        if (!subscribersList) return;
        try {
            const res = await fetch('/api/admin/subscribers');
            if (res.ok) {
                const subs = await res.json();
                if (subCountBadge) subCountBadge.textContent = `${subs.length} ${subs.length === 1 ? 'Subscriber' : 'Subscribers'}`;
                if (subs.length === 0) {
                    subscribersList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding-top: 50px;">No subscribers loaded.</div>';
                } else {
                    subscribersList.innerHTML = subs.map(sub => {
                        const localDate = new Date(sub.subscribedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
                        return `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1.5px solid rgba(255,255,255,0.02); font-size: 0.8rem;">
                            <span style="color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 60%;">${escapeHtml(sub.email)}</span>
                            <span style="color: var(--text-muted); font-size: 0.7rem;">${localDate}</span>
                        </div>`;
                    }).join('');
                }
            }
        } catch (error) {
            console.error("Failed to load subscribers:", error);
        }
    }

    if (btnExportSubscribers) {
        btnExportSubscribers.addEventListener('click', () => {
            window.open('/api/admin/subscribers/export', '_blank');
        });
    }

    loadSubscribers();
    setInterval(loadSubscribers, 10000);

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchFilterQuery = searchInput.value;
            currentPage = 1;
            populateManagerList();
        });
    }

    if (sortBySelect) {
        sortBySelect.value = currentSortBy;
        sortBySelect.addEventListener('change', () => {
            currentSortBy = sortBySelect.value;
            currentPage = 1;
            allArticles.sort((a, b) => {
                const aVal = a[currentSortBy] || '';
                const bVal = b[currentSortBy] || '';
                if (currentSortOrder === 'asc') {
                    return String(aVal).localeCompare(String(bVal));
                } else {
                    return String(bVal).localeCompare(String(aVal));
                }
            });
            populateManagerList();
        });
    }

    if (sortOrderSelect) {
        sortOrderSelect.value = currentSortOrder;
        sortOrderSelect.addEventListener('change', () => {
            currentSortOrder = sortOrderSelect.value;
            currentPage = 1;
            allArticles.sort((a, b) => {
                const aVal = a[currentSortBy] || '';
                const bVal = b[currentSortBy] || '';
                if (currentSortOrder === 'asc') {
                    return String(aVal).localeCompare(String(bVal));
                } else {
                    return String(bVal).localeCompare(String(aVal));
                }
            });
            populateManagerList();
        });
    }

    if (adminPerPageSelect) {
        adminPerPageSelect.addEventListener('change', () => {
            pageSize = parseInt(adminPerPageSelect.value);
            currentPage = 1;
            populateManagerList();
        });
    }

    if (adminPrevPageBtn) {
        adminPrevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                populateManagerList();
            }
        });
    }

    if (adminNextPageBtn) {
        adminNextPageBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                populateManagerList();
            }
        });
    }

    (async function init() {
        await fetchCsrfToken();
        await loadHeroContent();
        await loadHighlightsConfig();
        await loadCMSData();
        lucide.createIcons();
    })();
});