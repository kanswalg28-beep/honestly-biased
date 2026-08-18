document.addEventListener('DOMContentLoaded', () => {
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

    // ==========================================================================
    // CSRF TOKEN HANDLING
    // ==========================================================================
    let csrfToken = null;

    async function getCsrfToken() {
        if (csrfToken) return csrfToken;
        try {
            const res = await fetch('/api/admin/csrf', { credentials: 'same-origin' });
            if (res.ok) {
                const data = await res.json();
                csrfToken = data.csrfToken;
                return csrfToken;
            }
        } catch (e) {
            console.warn('Could not fetch CSRF token:', e);
        }
        return null;
    }

    async function apiRequest(url, options = {}) {
        const token = await getCsrfToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (token) {
            headers['X-CSRF-Token'] = token;
        }
        const res = await fetch(url, {
            ...options,
            headers,
            credentials: 'same-origin'
        });
        return res;
    }

    // ==========================================================================
    // TOAST NOTIFICATION SYSTEM
    // ==========================================================================
    const toastContainer = document.getElementById('toast-container');

    function showToast(message, type = 'info', title = '') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `cms-toast ${type}`;
        const icons = {
            success: 'check-circle',
            error: 'alert-circle',
            warning: 'alert-triangle',
            info: 'info'
        };
        const iconName = icons[type] || 'info';
        const defaultTitles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Notice'
        };
        const toastTitle = title || defaultTitles[type] || '';
        toast.innerHTML = `
            <i data-lucide="${iconName}" class="toast-icon"></i>
            <div class="toast-content">
                ${toastTitle ? `<div class="toast-title">${escapeHtml(toastTitle)}</div>` : ''}
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close notification">&times;</button>
        `;
        toastContainer.appendChild(toast);
        lucide.createIcons({ targets: [toast] });
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => removeToast(toast));
        }
        setTimeout(() => removeToast(toast), 4500);
    }

    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================================================
    // DOM ELEMENTS
    // ==========================================================================
    const cmsArticleForm = document.getElementById('cms-article-form');
    const cmsArticleId = document.getElementById('cms-article-id');
    const cmsCategory = document.getElementById('cms-category');
    const cmsPublishDate = document.getElementById('cms-publish-date');
    const cmsRegion = document.getElementById('cms-region');
    const cmsSource = document.getElementById('cms-source');
    const cmsHeadline = document.getElementById('cms-headline');
    const cmsBiasAudit = document.getElementById('cms-bias-audit');
    const cmsSummary = document.getElementById('cms-summary');
    const cmsFullBlog = document.getElementById('cms-full-blog');
    const cmsImageUrl = document.getElementById('cms-image-url');
    const cmsImageFile = document.getElementById('cms-image-file');
    const cmsPreviewImg = document.getElementById('cms-preview-img');
    const cmsOriginalUrl = document.getElementById('cms-original-url');
    const cmsSlug = document.getElementById('cms-slug');
    const btnCmsSubmit = document.getElementById('btn-cms-submit');
    const btnCmsReset = document.getElementById('btn-cms-reset');
    const cmsFormTitle = document.getElementById('cms-form-title');
    const cmsFormSubtitle = document.getElementById('cms-form-subtitle');

    // Stats Elements
    const statTotalArticles = document.getElementById('stat-total-articles');
    const statIndianEdition = document.getElementById('stat-indian-edition');
    const statWorldEdition = document.getElementById('stat-world-edition');
    const statUKEdition = document.getElementById('stat-uk-edition');
    const statBerkshireEdition = document.getElementById('stat-berkshire-edition');
    const statActiveEditions = document.getElementById('stat-active-editions');
    const statTopCategory = document.getElementById('stat-top-category');

    // Table & Filter Elements
    const cmsArticlesList = document.getElementById('cms-articles-list');
    const cmsSearch = document.getElementById('cms-search');
    const cmsRegionFilter = document.getElementById('cms-region-filter');
    const cmsCategoryFilter = document.getElementById('cms-category-filter');
    const btnRefreshList = document.getElementById('btn-refresh-list');
    const articlesCountBadge = document.getElementById('articles-count-badge');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationControls = document.getElementById('pagination-controls');

    // Hero & Highlights Editors
    const heroEditorForm = document.getElementById('hero-editor-form');
    const heroRegion = document.getElementById('hero-region');
    const heroHeadline = document.getElementById('hero-headline');
    const heroSummary = document.getElementById('hero-summary');
    const heroCategory = document.getElementById('hero-category');
    const heroImageUrl = document.getElementById('hero-image-url');
    const heroImageFile = document.getElementById('hero-image-file');
    const heroPreviewImg = document.getElementById('hero-preview-img');
    const heroOriginalUrl = document.getElementById('hero-original-url');
    const heroArticleSelect = document.getElementById('hero-article-select');

    const highlightsConfigForm = document.getElementById('highlights-config-form');
    const highlightsRegion = document.getElementById('highlights-region');
    const highlight1Select = document.getElementById('highlight-1-select');
    const highlight2Select = document.getElementById('highlight-2-select');
    const highlight3Select = document.getElementById('highlight-3-select');

    // State
    let allArticles = [];
    let filteredArticles = [];
    let currentPage = 1;
    const pageSize = 15;
    let editingArticleId = null;

    // Image upload sync
    function setupUrlSync(urlInput, previewImg) {
        if (!urlInput || !previewImg) return;
        urlInput.addEventListener('input', () => {
            const val = urlInput.value.trim();
            if (val) {
                previewImg.src = val;
                previewImg.style.display = 'block';
            } else {
                previewImg.style.display = 'none';
            }
        });
    }

    setupUrlSync(cmsImageUrl, cmsPreviewImg);
    setupUrlSync(heroImageUrl, heroPreviewImg);

    if (cmsHeadline) {
        cmsHeadline.addEventListener('input', () => {
            if (cmsSlug && !cmsSlug.dataset.touched) {
                cmsSlug.value = generateSlug(cmsHeadline.value);
            }
        });
    }
    if (cmsSlug) {
        cmsSlug.addEventListener('input', () => {
            cmsSlug.dataset.touched = 'true';
        });
    }

    // Direct Image Upload Handler
    async function uploadImageToServer(file) {
        const formData = new FormData();
        formData.append('image', file);
        const token = await getCsrfToken();
        const headers = {};
        if (token) headers['X-CSRF-Token'] = token;

        const res = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData,
            headers,
            credentials: 'same-origin'
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Upload failed');
        }

        const data = await res.json();
        return data.url;
    }

    if (cmsImageFile) {
        cmsImageFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                showToast('Uploading image...', 'info');
                const url = await uploadImageToServer(file);
                cmsImageUrl.value = url;
                cmsPreviewImg.src = url;
                cmsPreviewImg.style.display = 'block';
                showToast('Image uploaded successfully!', 'success');
            } catch (err) {
                showToast('Image upload failed: ' + err.message, 'error');
            }
        });
    }

    if (heroImageFile) {
        heroImageFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                showToast('Uploading hero image...', 'info');
                const url = await uploadImageToServer(file);
                heroImageUrl.value = url;
                heroPreviewImg.src = url;
                heroPreviewImg.style.display = 'block';
                showToast('Hero image uploaded successfully!', 'success');
            } catch (err) {
                showToast('Hero upload failed: ' + err.message, 'error');
            }
        });
    }

    // ==========================================================================
    // LOAD & RENDER ARTICLES
    // ==========================================================================
    async function loadCMSData() {
        try {
            if (cmsArticlesList) {
                cmsArticlesList.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Loading articles...</td></tr>`;
            }
            const res = await apiRequest('/api/admin/articles?limit=500&sortBy=publishdate&sortOrder=desc');
            if (!res.ok) throw new Error(`Failed to load articles (HTTP ${res.status})`);
            const data = await res.json();
            allArticles = data.articles || [];
            updateStats(allArticles);
            populateCategoryFilter(allArticles);
            applyFilters();
            populateHeroSelect(allArticles);
            populateHighlightSelects(allArticles);
        } catch (err) {
            console.error('loadCMSData error:', err);
            showToast('Failed to load articles: ' + err.message, 'error');
            if (cmsArticlesList) {
                cmsArticlesList.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Error loading chronicles</td></tr>`;
            }
        }
    }

    function updateStats(articles) {
        const total = articles.length;
        if (statTotalArticles) statTotalArticles.textContent = total;

        let indian = 0, world = 0, uk = 0, berkshire = 0;
        const catMap = {};

        articles.forEach(a => {
            const r = (a.region || '').toLowerCase();
            if (r === 'indian') indian++;
            else if (r === 'world') world++;
            else if (r === 'uk') uk++;
            else if (r === 'berkshire') berkshire++;

            const c = a.category || 'Uncategorized';
            catMap[c] = (catMap[c] || 0) + 1;
        });

        if (statIndianEdition) statIndianEdition.textContent = indian;
        if (statWorldEdition) statWorldEdition.textContent = world;
        if (statUKEdition) statUKEdition.textContent = uk;
        if (statBerkshireEdition) statBerkshireEdition.textContent = berkshire;
        if (statActiveEditions) statActiveEditions.textContent = 4;

        let topCat = 'None', topCount = 0;
        for (const [cat, count] of Object.entries(catMap)) {
            if (count > topCount) {
                topCount = count;
                topCat = cat;
            }
        }
        if (statTopCategory) statTopCategory.textContent = topCat;
    }

    function populateCategoryFilter(articles) {
        if (!cmsCategoryFilter) return;
        const currentVal = cmsCategoryFilter.value;
        const categories = new Set();
        articles.forEach(a => {
            if (a.category) categories.add(a.category);
        });

        cmsCategoryFilter.innerHTML = '<option value="">All Categories</option>';
        Array.from(categories).sort().forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            cmsCategoryFilter.appendChild(opt);
        });
        cmsCategoryFilter.value = currentVal;
    }

    function applyFilters() {
        const search = (cmsSearch ? cmsSearch.value : '').toLowerCase().trim();
        const region = (cmsRegionFilter ? cmsRegionFilter.value : '').toLowerCase().trim();
        const cat = (cmsCategoryFilter ? cmsCategoryFilter.value : '').trim();

        filteredArticles = allArticles.filter(a => {
            const matchSearch = !search || 
                (a.aiheadline && a.aiheadline.toLowerCase().includes(search)) ||
                (a.aisummary && a.aisummary.toLowerCase().includes(search)) ||
                (a.originalsource && a.originalsource.toLowerCase().includes(search));

            const matchRegion = !region || (a.region && a.region.toLowerCase() === region);
            const matchCat = !cat || (a.category === cat);

            return matchSearch && matchRegion && matchCat;
        });

        currentPage = 1;
        renderArticlesTable();
    }

    function renderArticlesTable() {
        if (!cmsArticlesList) return;

        if (articlesCountBadge) {
            articlesCountBadge.textContent = `${filteredArticles.length} Chronicle${filteredArticles.length === 1 ? '' : 's'}`;
        }

        if (filteredArticles.length === 0) {
            cmsArticlesList.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #94a3b8;">No chronicles matching criteria</td></tr>`;
            if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0';
            if (paginationControls) paginationControls.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(filteredArticles.length / pageSize);
        if (currentPage > totalPages) currentPage = totalPages;

        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, filteredArticles.length);
        const pageItems = filteredArticles.slice(start, end);

        if (paginationInfo) {
            paginationInfo.textContent = `Showing ${start + 1}–${end} of ${filteredArticles.length}`;
        }

        cmsArticlesList.innerHTML = pageItems.map(a => {
            const dateStr = a.publishdate ? new Date(a.publishdate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            }) : 'No date';
            const img = a.imageurl || '/assets/hero-bg.png';
            const regBadge = (a.region || 'indian').toUpperCase();
            const catBadge = a.category || 'General';

            return `
                <tr data-id="${a.id}">
                    <td>
                        <img src="${img}" alt="" class="article-table-thumb" onerror="this.src='/assets/hero-bg.png'" style="width: 48px; height: 36px; object-fit: cover; border-radius: 4px;">
                    </td>
                    <td>
                        <div class="article-table-headline">${escapeHtml(a.aiheadline || 'Untitled')}</div>
                        <div class="article-table-source" style="font-size: 0.8rem; color: #94a3b8;">${escapeHtml(a.originalsource || 'Editorial')}</div>
                    </td>
                    <td><span class="badge badge-region">${regBadge}</span></td>
                    <td><span class="badge badge-category">${escapeHtml(catBadge)}</span></td>
                    <td style="font-size: 0.85rem; color: #94a3b8;">${dateStr}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-action btn-edit" title="Edit Article" data-action="edit" data-id="${a.id}">
                                <i data-lucide="edit-3"></i>
                            </button>
                            <button class="btn-action btn-delete" title="Delete Article" data-action="delete" data-id="${a.id}">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons({ targets: [cmsArticlesList] });
        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        if (!paginationControls) return;
        if (totalPages <= 1) {
            paginationControls.innerHTML = '';
            return;
        }

        let html = `
            <button class="btn-page" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">&larr; Prev</button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span class="page-ellipsis">...</span>`;
            }
        }

        html += `
            <button class="btn-page" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">Next &rarr;</button>
        `;

        paginationControls.innerHTML = html;
    }

    if (paginationControls) {
        paginationControls.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-page');
            if (!btn || btn.disabled) return;
            const targetPage = parseInt(btn.dataset.page);
            if (targetPage && targetPage !== currentPage) {
                currentPage = targetPage;
                renderArticlesTable();
                const listSection = document.querySelector('.articles-manager-card');
                if (listSection) listSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // ==========================================================================
    // TABLE ACTIONS (EDIT & DELETE)
    // ==========================================================================
    if (cmsArticlesList) {
        cmsArticlesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-action');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (!id) return;

            if (action === 'edit') {
                loadArticleForEdit(id);
            } else if (action === 'delete') {
                confirmAndDeleteArticle(id);
            }
        });
    }

    function loadArticleForEdit(id) {
        const article = allArticles.find(a => String(a.id) === String(id));
        if (!article) {
            showToast('Chronicle not found in memory', 'error');
            return;
        }

        editingArticleId = id;
        cmsArticleId.value = article.id;
        cmsCategory.value = article.category || 'Politics';
        cmsRegion.value = (article.region || 'indian').toLowerCase();
        cmsSource.value = article.originalsource || '';
        cmsHeadline.value = article.aiheadline || '';
        cmsBiasAudit.value = article.biasaudit || '';
        cmsSummary.value = article.aisummary || '';
        cmsFullBlog.value = article.fullblog || article.content || '';
        cmsImageUrl.value = article.imageurl || '';
        cmsOriginalUrl.value = article.originalurl || '';

        if (cmsSlug) {
            cmsSlug.value = article.slug || generateSlug(article.aiheadline || '');
            cmsSlug.dataset.touched = article.slug ? 'true' : '';
        }

        if (article.imageurl && cmsPreviewImg) {
            cmsPreviewImg.src = article.imageurl;
            cmsPreviewImg.style.display = 'block';
        } else if (cmsPreviewImg) {
            cmsPreviewImg.style.display = 'none';
        }

        if (cmsPublishDate && article.publishdate) {
            try {
                const d = new Date(article.publishdate);
                cmsPublishDate.value = d.toISOString().slice(0, 16);
            } catch (err) {
                cmsPublishDate.value = '';
            }
        }

        if (cmsFormTitle) cmsFormTitle.textContent = 'Edit Chronicle';
        if (cmsFormSubtitle) cmsFormSubtitle.textContent = `Editing: "${(article.aiheadline || '').slice(0, 45)}..."`;
        if (btnCmsSubmit) btnCmsSubmit.innerHTML = `<i data-lucide="check"></i> Save Changes`;
        if (btnCmsReset) btnCmsReset.style.display = 'inline-flex';

        const formCard = document.querySelector('.cms-panel-card');
        if (formCard) {
            formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        lucide.createIcons();
        showToast('Loaded article into editor', 'info');
    }

    function cancelEditMode() {
        editingArticleId = null;
        if (cmsArticleId) cmsArticleId.value = '';
        if (cmsArticleForm) cmsArticleForm.reset();
        if (cmsPreviewImg) cmsPreviewImg.style.display = 'none';
        if (cmsSlug) {
            cmsSlug.value = '';
            delete cmsSlug.dataset.touched;
        }
        if (cmsFormTitle) cmsFormTitle.textContent = 'Compose New Chronicle';
        if (cmsFormSubtitle) cmsFormSubtitle.textContent = 'Add opinionated, satire-infused commentary to the catalog.';
        if (btnCmsSubmit) btnCmsSubmit.innerHTML = `<i data-lucide="send"></i> Publish Chronicle`;
        if (btnCmsReset) btnCmsReset.style.display = 'none';
        lucide.createIcons();
    }

    if (btnCmsReset) {
        btnCmsReset.addEventListener('click', cancelEditMode);
    }

    async function confirmAndDeleteArticle(id) {
        const article = allArticles.find(a => String(a.id) === String(id));
        const headline = article ? article.aiheadline : 'this chronicle';
        if (!confirm(`Are you sure you want to permanently delete "${headline}"?`)) {
            return;
        }

        try {
            showToast('Deleting chronicle...', 'info');
            const res = await apiRequest(`/api/admin/articles?id=${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            allArticles = allArticles.filter(a => String(a.id) !== String(id));
            updateStats(allArticles);
            applyFilters();
            populateHeroSelect(allArticles);
            populateHighlightSelects(allArticles);

            if (editingArticleId && String(editingArticleId) === String(id)) {
                cancelEditMode();
            }

            showToast('Chronicle deleted successfully', 'success');
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete: ' + err.message, 'error');
        }
    }

    // ==========================================================================
    // ARTICLE FORM SUBMIT (CREATE / EDIT)
    // ==========================================================================
    if (cmsArticleForm) {
        cmsArticleForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const isEdit = !!editingArticleId;
            const payload = {
                category: cmsCategory.value,
                region: (cmsRegion.value || 'indian').toLowerCase(),
                originalsource: cmsSource.value || 'Editorial Board',
                aiheadline: cmsHeadline.value.trim(),
                slug: cmsSlug && cmsSlug.value ? cmsSlug.value.trim() : generateSlug(cmsHeadline.value),
                biasaudit: cmsBiasAudit.value.trim(),
                aisummary: cmsSummary.value.trim(),
                fullblog: cmsFullBlog.value.trim(),
                imageurl: cmsImageUrl.value.trim() || '/assets/hero-bg.png',
                originalurl: cmsOriginalUrl.value || '#'
            };

            if (cmsPublishDate && cmsPublishDate.value) {
                payload.publishdate = new Date(cmsPublishDate.value).toISOString();
            }

            if (!payload.aiheadline) {
                showToast('Please enter a headline', 'warning');
                return;
            }

            try {
                const submitBtn = btnCmsSubmit;
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = isEdit ? 'Saving...' : 'Publishing...';
                }

                let res;
                if (isEdit) {
                    res = await apiRequest(`/api/admin/articles?id=${editingArticleId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload)
                    });
                } else {
                    res = await apiRequest('/api/admin/articles', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                }

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${res.status}`);
                }

                const savedArticle = await res.json();

                if (isEdit) {
                    const idx = allArticles.findIndex(a => String(a.id) === String(editingArticleId));
                    if (idx !== -1) {
                        allArticles[idx] = { ...allArticles[idx], ...savedArticle };
                    }
                    showToast('Chronicle updated successfully!', 'success');
                } else {
                    allArticles.unshift(savedArticle);
                    showToast('Chronicle published successfully!', 'success');
                }

                cancelEditMode();
                updateStats(allArticles);
                populateCategoryFilter(allArticles);
                applyFilters();
                populateHeroSelect(allArticles);
                populateHighlightSelects(allArticles);

            } catch (err) {
                console.error('Submit error:', err);
                showToast('Operation failed: ' + err.message, 'error');
            } finally {
                if (btnCmsSubmit) {
                    btnCmsSubmit.disabled = false;
                    btnCmsSubmit.innerHTML = isEdit ? `<i data-lucide="check"></i> Save Changes` : `<i data-lucide="send"></i> Publish Chronicle`;
                    lucide.createIcons();
                }
            }
        });
    }

    // Filter Listeners
    if (cmsSearch) cmsSearch.addEventListener('input', applyFilters);
    if (cmsRegionFilter) cmsRegionFilter.addEventListener('change', applyFilters);
    if (cmsCategoryFilter) cmsCategoryFilter.addEventListener('change', applyFilters);
    if (btnRefreshList) btnRefreshList.addEventListener('click', loadCMSData);

    // ==========================================================================
    // HERO & HIGHLIGHTS EDITORS
    // ==========================================================================
    function populateHeroSelect(articles) {
        if (!heroArticleSelect) return;
        const currentRegion = (heroRegion ? heroRegion.value : 'indian').toLowerCase();
        const matching = articles.filter(a => (a.region || 'indian').toLowerCase() === currentRegion);
        heroArticleSelect.innerHTML = '<option value="">-- Choose Existing Article to Autofill --</option>' +
            matching.map(a => `<option value="${a.id}">${escapeHtml(a.aiheadline || 'Untitled')}</option>`).join('');
    }

    if (heroArticleSelect) {
        heroArticleSelect.addEventListener('change', () => {
            const id = heroArticleSelect.value;
            if (!id) return;
            const article = allArticles.find(a => String(a.id) === String(id));
            if (!article) return;
            if (heroHeadline) heroHeadline.value = article.aiheadline || '';
            if (heroSummary) heroSummary.value = article.aisummary || '';
            if (heroCategory) heroCategory.value = article.category || 'Politics';
            if (heroImageUrl) {
                heroImageUrl.value = article.imageurl || '';
                if (heroPreviewImg) {
                    heroPreviewImg.src = article.imageurl || '';
                    heroPreviewImg.style.display = article.imageurl ? 'block' : 'none';
                }
            }
            if (heroOriginalUrl) heroOriginalUrl.value = article.originalurl || '';
        });
    }

    if (heroRegion) {
        heroRegion.addEventListener('change', () => {
            populateHeroSelect(allArticles);
            loadHeroConfig();
        });
    }

    async function loadHeroConfig() {
        const region = (heroRegion ? heroRegion.value : 'indian').toLowerCase();
        try {
            const res = await apiRequest(`/api/admin/hero?region=${region}`);
            if (res.ok) {
                const hero = await res.json();
                if (hero && hero.headline) {
                    if (heroHeadline) heroHeadline.value = hero.headline || '';
                    if (heroSummary) heroSummary.value = hero.summary || '';
                    if (heroCategory) heroCategory.value = hero.category || 'Politics';
                    if (heroImageUrl) {
                        heroImageUrl.value = hero.imageurl || '';
                        if (heroPreviewImg) {
                            heroPreviewImg.src = hero.imageurl || '';
                            heroPreviewImg.style.display = hero.imageurl ? 'block' : 'none';
                        }
                    }
                    if (heroOriginalUrl) heroOriginalUrl.value = hero.originalurl || '';
                }
            }
        } catch (e) {
            console.warn('Could not load hero config for region:', region);
        }
    }

    if (heroEditorForm) {
        heroEditorForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const region = (heroRegion ? heroRegion.value : 'indian').toLowerCase();
            const payload = {
                region,
                headline: heroHeadline.value.trim(),
                summary: heroSummary.value.trim(),
                category: heroCategory.value,
                imageurl: heroImageUrl.value.trim(),
                originalurl: heroOriginalUrl.value.trim()
            };
            try {
                showToast('Saving hero banner...', 'info');
                const res = await apiRequest('/api/admin/hero', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                showToast(`Hero banner for ${region.toUpperCase()} updated!`, 'success');
            } catch (err) {
                showToast('Failed to update hero: ' + err.message, 'error');
            }
        });
    }

    function populateHighlightSelects(articles) {
        const currentRegion = (highlightsRegion ? highlightsRegion.value : 'indian').toLowerCase();
        const matching = articles.filter(a => (a.region || 'indian').toLowerCase() === currentRegion);
        const opts = '<option value="">-- None --</option>' +
            matching.map(a => `<option value="${a.id}">${escapeHtml(a.aiheadline || 'Untitled')}</option>`).join('');

        if (highlight1Select) highlight1Select.innerHTML = opts;
        if (highlight2Select) highlight2Select.innerHTML = opts;
        if (highlight3Select) highlight3Select.innerHTML = opts;
    }

    if (highlightsRegion) {
        highlightsRegion.addEventListener('change', () => {
            populateHighlightSelects(allArticles);
            loadHighlightsConfig();
        });
    }

    async function loadHighlightsConfig() {
        const region = (highlightsRegion ? highlightsRegion.value : 'indian').toLowerCase();
        try {
            const res = await apiRequest(`/api/admin/highlights?region=${region}`);
            if (res.ok) {
                const hl = await res.json();
                if (hl && hl.article_ids) {
                    if (highlight1Select) highlight1Select.value = hl.article_ids[0] || '';
                    if (highlight2Select) highlight2Select.value = hl.article_ids[1] || '';
                    if (highlight3Select) highlight3Select.value = hl.article_ids[2] || '';
                }
            }
        } catch (e) {
            console.warn('Could not load highlights for region:', region);
        }
    }

    if (highlightsConfigForm) {
        highlightsConfigForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const region = (highlightsRegion ? highlightsRegion.value : 'indian').toLowerCase();
            const article_ids = [
                highlight1Select ? highlight1Select.value : '',
                highlight2Select ? highlight2Select.value : '',
                highlight3Select ? highlight3Select.value : ''
            ].filter(Boolean);

            try {
                showToast('Saving highlights...', 'info');
                const res = await apiRequest('/api/admin/highlights', {
                    method: 'POST',
                    body: JSON.stringify({ region, article_ids })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                showToast(`Highlights for ${region.toUpperCase()} updated!`, 'success');
            } catch (err) {
                showToast('Failed to update highlights: ' + err.message, 'error');
            }
        });
    }

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    (async function init() {
        await loadHeroConfig();
        await loadHighlightsConfig();
        await loadCMSData();
        lucide.createIcons();
    })();
});
