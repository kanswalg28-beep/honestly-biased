// admin-with-upload.js — Honestly Biased CMS Core Operations Controller
document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // STATE & VARIABLES
    // ==========================================================================
    let allArticles = [];
    let filteredArticles = [];
    let currentPage = 1;
    let itemsPerPage = 22;
    let editingArticleId = null;
    let csrfToken = null;

    // DOM Elements - Metrics
    const statTotal = document.getElementById('stat-total');
    const statEditorial = document.getElementById('stat-editorial');
    const statAi = document.getElementById('stat-ai');
    const statCategories = document.getElementById('stat-categories');

    // DOM Elements - Inventory List & Filters
    const articlesContainer = document.getElementById('admin-articles-list');
    const searchInput = document.getElementById('cms-search');
    const sortBySelect = document.getElementById('cms-sort-by');
    const sortOrderSelect = document.getElementById('cms-sort-order');

    // DOM Elements - Pagination
    const perPageSelect = document.getElementById('admin-per-page-select');
    const prevPageBtn = document.getElementById('admin-prev-page');
    const nextPageBtn = document.getElementById('admin-next-page');
    const pageIndicator = document.getElementById('admin-page-indicator');

    // DOM Elements - Article Editor Form
    const articleForm = document.getElementById('cms-article-form');
    const formTitle = document.getElementById('cms-form-title');
    const formSubtitle = document.getElementById('cms-form-subtitle');
    const articleIdInput = document.getElementById('cms-article-id');
    const categoryInput = document.getElementById('cms-category');
    const publishDateInput = document.getElementById('cms-publish-date');
    const regionInput = document.getElementById('cms-region');
    const sourceInput = document.getElementById('cms-source');
    const headlineInput = document.getElementById('cms-headline');
    const biasAuditInput = document.getElementById('cms-bias-audit');
    const summaryInput = document.getElementById('cms-summary');
    const fullBlogInput = document.getElementById('cms-full-blog');
    const imageUrlInput = document.getElementById('cms-image-url');
    const originalUrlInput = document.getElementById('cms-original-url');
    const previewImg = document.getElementById('cms-preview-img');
    const previewPlaceholder = document.getElementById('cms-preview-placeholder');
    const btnSubmit = document.getElementById('btn-cms-submit');
    const btnReset = document.getElementById('btn-cms-reset');

    // DOM Elements - Image Upload
    const imageUploadInput = document.getElementById('cms-image-upload');
    const imageUploadBtn = document.getElementById('cms-image-upload-btn');
    const imageUploadStatus = document.getElementById('cms-image-upload-status');

    // DOM Elements - Subscribers
    const subscribersList = document.getElementById('subscribers-list');
    const subCountBadge = document.getElementById('sub-count-badge');
    const btnExportSubscribers = document.getElementById('btn-export-subscribers');

    // Toast Container
    const toastContainer = document.getElementById('toast-container');

    // ==========================================================================
    // UTILITIES
    // ==========================================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type = 'info') {
        if (!toastContainer) {
            alert(message);
            return;
        }
        const toast = document.createElement('div');
        toast.className = `cms-toast ${type}`;
        toast.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            padding: 12px 18px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;
            background: rgba(14, 22, 34, 0.95); border: 1px solid rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(16px);
            color: ${type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#00e5ff')};
            animation: fadeIn 0.2s ease-out; margin-bottom: 8px;
        `;
        toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================================================
    // CSRF & API CLIENT
    // ==========================================================================
    async function getCsrfToken() {
        if (csrfToken) return csrfToken;
        try {
            const res = await fetch('/api/admin/csrf');
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
        return fetch(url, {
            ...options,
            headers
        });
    }

    // ==========================================================================
    // LOAD ARTICLES FROM DATABASE
    // ==========================================================================
    async function loadCMSData() {
        try {
            if (articlesContainer) {
                articlesContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.9rem;">
                        <i data-lucide="loader" style="width: 24px; height: 24px; animation: spin 1s linear infinite; margin-bottom: 8px; display: inline-block;"></i>
                        <div>Loading ledger chronicle inventory...</div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }

            const res = await apiRequest('/api/admin/articles?limit=500&sortBy=publishdate&sortOrder=desc');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            allArticles = data.articles || [];

            updateMetrics(allArticles);
            applyFiltersAndRender();
        } catch (err) {
            console.error('loadCMSData error:', err);
            showToast('Failed to load chronicles: ' + err.message, 'error');
            if (articlesContainer) {
                articlesContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #ef4444; font-size: 0.9rem;">
                        <i data-lucide="alert-circle" style="width: 24px; height: 24px; margin-bottom: 8px; display: inline-block;"></i>
                        <div>Error loading inventory from database. Please refresh.</div>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ==========================================================================
    // METRICS
    // ==========================================================================
    function updateMetrics(articles) {
        if (statTotal) statTotal.textContent = articles.length;

        let editorialCount = 0;
        let aiCount = 0;
        const categories = new Set();

        articles.forEach(a => {
            if (a.authortype === 'admin' || (a.originalsource && a.originalsource.toLowerCase().includes('editorial'))) {
                editorialCount++;
            } else {
                aiCount++;
            }
            if (a.category) categories.add(a.category.trim());
        });

        if (statEditorial) statEditorial.textContent = editorialCount;
        if (statAi) statAi.textContent = aiCount;
        if (statCategories) statCategories.textContent = categories.size;
    }

    // ==========================================================================
    // FILTERING, SORTING & RENDERING
    // ==========================================================================
    function applyFiltersAndRender() {
        const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const sortBy = sortBySelect ? sortBySelect.value : 'publishdate';
        const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'desc';

        // 1. Filter
        filteredArticles = allArticles.filter(a => {
            if (!query) return true;
            const headline = (a.aiheadline || a.title || '').toLowerCase();
            const summary = (a.aisummary || a.summary || '').toLowerCase();
            const source = (a.originalsource || '').toLowerCase();
            const category = (a.category || '').toLowerCase();
            const region = (a.region || '').toLowerCase();
            return headline.includes(query) || summary.includes(query) || source.includes(query) || category.includes(query) || region.includes(query);
        });

        // 2. Sort
        filteredArticles.sort((a, b) => {
            let valA = a[sortBy] || '';
            let valB = b[sortBy] || '';

            if (sortBy === 'publishdate') {
                valA = new Date(valA).getTime() || 0;
                valB = new Date(valB).getTime() || 0;
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        renderInventoryGrid();
    }

    function renderInventoryGrid() {
        if (!articlesContainer) return;

        if (filteredArticles.length === 0) {
            articlesContainer.innerHTML = `
                <div style="text-align: center; padding: 48px 24px; color: var(--text-muted);">
                    <i data-lucide="search-x" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block; opacity: 0.5;"></i>
                    <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary); margin-bottom: 4px;">No Chronicles Found</div>
                    <p style="font-size: 0.8rem; margin: 0;">Try adjusting your search query or sorting options.</p>
                </div>
            `;
            if (pageIndicator) pageIndicator.textContent = '0 / 0';
            if (prevPageBtn) prevPageBtn.disabled = true;
            if (nextPageBtn) nextPageBtn.disabled = true;
            if (window.lucide) lucide.createIcons();
            return;
        }

        const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const start = (currentPage - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, filteredArticles.length);
        const pageArticles = filteredArticles.slice(start, end);

        articlesContainer.innerHTML = pageArticles.map(article => {
            const headline = article.aiheadline || article.title || 'Untitled Chronicle';
            const summary = article.aisummary || article.summary || '';
            const category = article.category || 'Politics';
            const region = (article.region || 'indian').toUpperCase();
            const image = article.imageurl || '/assets/hero-bg.png';
            const dateStr = article.publishdate ? new Date(article.publishdate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            }) : 'Draft';
            const isEditorial = article.authortype === 'admin' || (article.originalsource && article.originalsource.toLowerCase().includes('editorial'));
            const isInstagram = article.authortype === 'instagram';

            return `
                <div class="inventory-card glass-element" data-id="${article.id}" style="display: flex; gap: 16px; padding: 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid var(--border-color); background: var(--bg-card); transition: all 0.2s;">
                    <div style="width: 100px; height: 75px; flex-shrink: 0; border-radius: 8px; overflow: hidden; background: var(--bg-secondary); position: relative;">
                        <img src="${escapeHtml(image)}" alt="" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/assets/hero-bg.png';">
                        <span style="position: absolute; bottom: 4px; left: 4px; font-size: 0.6rem; font-weight: 700; background: rgba(0,0,0,0.75); color: #fff; padding: 2px 6px; border-radius: 3px;">${escapeHtml(region)}</span>
                    </div>
                    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                            <span class="modal-tag saffron-bg" style="font-size: 0.65rem; padding: 2px 8px; border-radius: 3px; font-weight: 700;">${escapeHtml(category)}</span>
                            <span style="font-size: 0.7rem; color: var(--text-muted);"><i data-lucide="calendar" style="width: 11px; height: 11px; vertical-align: -1px;"></i> ${escapeHtml(dateStr)}</span>
                            ${isEditorial ? '<span style="font-size: 0.7rem; color: var(--accent-green); font-weight: 700;"><i data-lucide="pen-tool" style="width: 11px; height: 11px; vertical-align: -1px;"></i> Editorial</span>' : (isInstagram ? '<span style="font-size: 0.7rem; color: #e1306c; font-weight: 700;"><i data-lucide="instagram" style="width: 11px; height: 11px; vertical-align: -1px;"></i> IG Video</span>' : '<span style="font-size: 0.7rem; color: #00E5FF; font-weight: 700;"><i data-lucide="cpu" style="width: 11px; height: 11px; vertical-align: -1px;"></i> AI Audited</span>')}
                        </div>
                        <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0 0 6px 0; color: var(--text-primary); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                            ${escapeHtml(headline)}
                        </h4>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;">
                            ${escapeHtml(summary)}
                        </p>
                    </div>
                    <div style="display: flex; flex-direction: column; justify-content: center; gap: 8px; flex-shrink: 0; border-left: 1px solid var(--border-color); padding-left: 14px;">
                        <button type="button" class="btn-edit-article" data-id="${article.id}" title="Edit Chronicle" style="padding: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); cursor: pointer; transition: all 0.2s;">
                            <i data-lucide="edit-3" style="width: 15px; height: 15px;"></i>
                        </button>
                        <button type="button" class="btn-delete-article" data-id="${article.id}" title="Delete Chronicle" style="padding: 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px; color: #ef4444; cursor: pointer; transition: all 0.2s;">
                            <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (pageIndicator) pageIndicator.textContent = `${currentPage} / ${totalPages}`;
        if (prevPageBtn) {
            prevPageBtn.disabled = currentPage <= 1;
            prevPageBtn.style.opacity = currentPage <= 1 ? '0.3' : '1';
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = currentPage >= totalPages;
            nextPageBtn.style.opacity = currentPage >= totalPages ? '0.3' : '1';
        }

        if (window.lucide) lucide.createIcons();
    }

    // ==========================================================================
    // EVENT LISTENERS - SEARCH, SORT, PAGINATION
    // ==========================================================================
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    if (sortBySelect) {
        sortBySelect.addEventListener('change', () => {
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    if (sortOrderSelect) {
        sortOrderSelect.addEventListener('change', () => {
            applyFiltersAndRender();
        });
    }

    if (perPageSelect) {
        perPageSelect.addEventListener('change', () => {
            itemsPerPage = parseInt(perPageSelect.value) || 22;
            currentPage = 1;
            renderInventoryGrid();
        });
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderInventoryGrid();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredArticles.length / itemsPerPage) || 1;
            if (currentPage < totalPages) {
                currentPage++;
                renderInventoryGrid();
            }
        });
    }

    // ==========================================================================
    // ARTICLE EDIT & DELETE ACTIONS
    // ==========================================================================
    if (articlesContainer) {
        articlesContainer.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.btn-edit-article');
            const deleteBtn = e.target.closest('.btn-delete-article');

            if (editBtn) {
                const id = editBtn.dataset.id;
                const article = allArticles.find(a => String(a.id) === String(id));
                if (!article) return;

                editingArticleId = article.id;
                if (articleIdInput) articleIdInput.value = article.id;
                if (formTitle) formTitle.textContent = 'Refine Chronicle';
                if (formSubtitle) formSubtitle.textContent = `Editing ID: ${article.id.slice(0, 8)}...`;
                if (btnSubmit) btnSubmit.textContent = 'Save Changes';
                if (btnReset) btnReset.style.display = 'inline-block';

                if (headlineInput) headlineInput.value = article.aiheadline || article.title || '';
                if (summaryInput) summaryInput.value = article.aisummary || article.summary || '';
                if (biasAuditInput) biasAuditInput.value = article.biasaudit || '';
                if (fullBlogInput) fullBlogInput.value = article.fullblog || '';
                if (categoryInput) categoryInput.value = article.category || 'Politics';
                if (regionInput) regionInput.value = (article.region || 'indian').toLowerCase();
                if (sourceInput) sourceInput.value = article.originalsource || 'Editorial';
                if (originalUrlInput) originalUrlInput.value = article.originalurl || '';
                if (imageUrlInput) {
                    imageUrlInput.value = article.imageurl || '';
                    updateImagePreview(article.imageurl);
                }

                window.scrollTo({ top: 0, behavior: 'smooth' });
                showToast('Editing chronicle loaded in form', 'info');
            }

            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                const article = allArticles.find(a => String(a.id) === String(id));
                const headline = article ? (article.aiheadline || article.title) : 'this chronicle';

                if (!confirm(`Are you sure you want to permanently delete "${headline}"?`)) return;

                try {
                    showToast('Deleting chronicle...', 'info');
                    const res = await apiRequest(`/api/admin/articles?id=${id}`, {
                        method: 'DELETE'
                    });

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    showToast('Chronicle deleted successfully', 'success');

                    allArticles = allArticles.filter(a => String(a.id) !== String(id));
                    updateMetrics(allArticles);
                    applyFiltersAndRender();
                } catch (err) {
                    showToast('Failed to delete: ' + err.message, 'error');
                }
            }
        });
    }

    // ==========================================================================
    // FORM RESET & SUBMISSION
    // ==========================================================================
    function resetArticleForm() {
        editingArticleId = null;
        if (articleIdInput) articleIdInput.value = '';
        if (articleForm) articleForm.reset();
        if (formTitle) formTitle.textContent = 'Author New Chronicle';
        if (formSubtitle) formSubtitle.textContent = 'Draft fresh satire or uncompromised bias audit.';
        if (btnSubmit) btnSubmit.textContent = 'Publish Editorial';
        if (btnReset) btnReset.style.display = 'none';
        updateImagePreview('');
    }

    if (btnReset) {
        btnReset.addEventListener('click', resetArticleForm);
    }

    if (articleForm) {
        articleForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const headline = (headlineInput ? headlineInput.value : '').trim();
            const summary = (summaryInput ? summaryInput.value : '').trim();
            const biasaudit = (biasAuditInput ? biasAuditInput.value : '').trim();
            const fullblog = (fullBlogInput ? fullBlogInput.value : '').trim();
            const category = (categoryInput ? categoryInput.value : 'Politics').trim();
            const region = (regionInput ? regionInput.value : 'indian').toLowerCase().trim();
            const originalsource = (sourceInput ? sourceInput.value : 'Editorial').trim();
            const originalurl = (originalUrlInput ? originalUrlInput.value : '').trim();
            const imageurl = (imageUrlInput ? imageUrlInput.value : '').trim();

            if (!headline) {
                showToast('Headline is required', 'warning');
                return;
            }

            const payload = {
                aiheadline: headline,
                aisummary: summary,
                biasaudit: biasaudit || summary,
                fullblog: fullblog || summary,
                category,
                region,
                originalsource,
                originalurl,
                imageurl,
                authortype: 'admin',
                author: 'Honestly Biased Editorial Board'
            };

            try {
                showToast(editingArticleId ? 'Saving updates...' : 'Publishing chronicle...', 'info');
                let res;

                if (editingArticleId) {
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
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                showToast(editingArticleId ? 'Chronicle updated!' : 'Chronicle published!', 'success');
                resetArticleForm();
                await loadCMSData();
            } catch (err) {
                showToast('Publishing failed: ' + err.message, 'error');
            }
        });
    }

    // ==========================================================================
    // IMAGE PREVIEW & UPLOAD
    // ==========================================================================
    function updateImagePreview(src) {
        if (!previewImg) return;
        if (src) {
            previewImg.src = src;
            previewImg.style.display = 'block';
            if (previewPlaceholder) previewPlaceholder.style.display = 'none';
        } else {
            previewImg.src = '';
            previewImg.style.display = 'none';
            if (previewPlaceholder) previewPlaceholder.style.display = 'block';
        }
    }

    if (imageUrlInput) {
        imageUrlInput.addEventListener('input', () => {
            updateImagePreview(imageUrlInput.value.trim());
        });
    }

    if (imageUploadBtn && imageUploadInput) {
        imageUploadBtn.addEventListener('click', () => imageUploadInput.click());

        imageUploadInput.addEventListener('change', async () => {
            const file = imageUploadInput.files[0];
            if (!file) return;

            if (imageUploadStatus) imageUploadStatus.textContent = 'Uploading image...';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const token = await getCsrfToken();
                const headers = {};
                if (token) headers['X-CSRF-Token'] = token;

                const res = await fetch('/api/admin/upload', {
                    method: 'POST',
                    headers,
                    body: formData
                });

                if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
                const data = await res.json();

                if (data.url) {
                    if (imageUrlInput) imageUrlInput.value = data.url;
                    updateImagePreview(data.url);
                    if (imageUploadStatus) imageUploadStatus.textContent = 'Upload successful!';
                    showToast('Image uploaded and linked!', 'success');
                }
            } catch (err) {
                if (imageUploadStatus) imageUploadStatus.textContent = 'Upload error';
                showToast('Image upload failed: ' + err.message, 'error');
            }
        });
    }

    // ==========================================================================
    // SUBSCRIBERS LOAD & EXPORT
    // ==========================================================================
    async function loadSubscribers() {
        try {
            const res = await apiRequest('/api/admin/subscribers');
            if (res.ok) {
                const data = await res.json();
                const subs = data.subscribers || [];
                if (subCountBadge) subCountBadge.textContent = `${subs.length} Subscriber${subs.length === 1 ? '' : 's'}`;
                if (subscribersList) {
                    if (subs.length === 0) {
                        subscribersList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding-top: 50px;">No subscribers found.</div>';
                    } else {
                        subscribersList.innerHTML = subs.map(s => `
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding: 4px 0;">
                                <span style="color: var(--text-primary);">${escapeHtml(s.email)}</span>
                                <span style="color: var(--text-muted); font-size: 0.7rem;">${escapeHtml(s.date || '')}</span>
                            </div>
                        `).join('');
                    }
                }
            }
        } catch (e) {
            console.warn('Subscribers load failed:', e);
        }
    }

    if (btnExportSubscribers) {
        btnExportSubscribers.addEventListener('click', async () => {
            try {
                const res = await apiRequest('/api/admin/subscribers');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const subs = data.subscribers || [];
                if (subs.length === 0) {
                    showToast('No subscribers to export', 'warning');
                    return;
                }
                const csv = 'Email,Date\n' + subs.map(s => `"${s.email}","${s.date || ''}"`).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `honestly-biased-subscribers-${Date.now()}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Exported subscribers CSV', 'success');
            } catch (err) {
                showToast('Export failed: ' + err.message, 'error');
            }
        });
    }

    // ==========================================================================
    // INITIALIZATION
    // ==========================================================================
    (async function init() {
        await loadCMSData();
        await loadSubscribers();
        if (window.lucide) lucide.createIcons();
    })();
});
