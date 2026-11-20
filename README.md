# Honestly Biased & TaxMetrics

An archival, high-performance media forensics platform and client-side tax modeling suite.

- **Production Domain:** `https://www.honestlybiased.com`
- **TaxMetrics Suite:** `https://www.honestlybiased.com/taxmetrics`
- **Architecture:** Zero-framework vanilla HTML5, semantic CSS3, ES6+ JavaScript, and Vercel Serverless Functions on Node.js 24.x.

---

## 1. Architectural Philosophy

Honestly Biased is engineered for maximum performance, minimal attack surface, and long-term archival reliability without heavy bundlers or JavaScript frameworks (no React, Next.js, Vue, or Tailwind).

- **Zero-Framework Client:** Direct DOM hydration, hardware-accelerated Canvas WebGL visualizers, and CSS variables for high-fidelity dark-mode typography.
- **Serverless Edge Delivery:** Static assets served from Vercel's global CDN; dynamic content hydrated through 6 decoupled Vercel Serverless Functions.
- **Strict Budget Compliance:** Functions stay strictly within Vercel's 12-function limit (currently utilizing 6).
- **Privacy-First Tax Computation:** 100% client-side tax calculations in `TaxMetrics`—salary and deduction inputs never touch external servers or third-party databases.

---

## 2. Repository Layout

```
.
├── .gitignore                 # Git ignore rules for runtime caches, node_modules, .env
├── .vercelignore              # Blocks non-public dev scripts and tests from static CDN serving
├── vercel.json                # Vercel routing, rewrites, 301 redirects, security headers
├── package.json               # Node 24.x engine, scripts, and production dependencies
├── README.md                  # System documentation
│
├── api/                       # Vercel Serverless Functions (6 Active Endpoints)
│   ├── _admin/                # Internal admin route handlers (articles, upload, repair, etc.)
│   ├── admin.js               # Editorial control center & CMS mutation gateway
│   ├── article.js             # Chronicle dispatch renderer (SSR metadata & OpenGraph)
│   ├── home.js                # Editorial homepage SSR with caching and category filtering
│   ├── honestly-biased-feed.js# Syndication and JSON feed endpoint
│   ├── site-content.js        # Global site metadata and ticker state
│   └── sitemap.js             # Dynamic sitemap & RSS generator
│
├── db/                        # Database utilities & text processing engines
│   ├── classifyCategory.js    # Multi-domain keyword scoring & drift prevention engine
│   ├── cleanEditorialText.js  # Orthography, grammar, apostrophe, and hyphenation normalizer
│   ├── getSupabaseClient.js   # Supabase client initializer
│   └── supabaseAdmin.js       # Administrative Supabase client with service key
│
├── scripts/                   # Production build scripts and maintenance utilities
│   ├── classifyRegion.js      # Regional geopolitical categorization helper
│   ├── generate-images.js     # Responsive WebP/AVIF image generation pipeline (sharp)
│   ├── generate-sitemap.js    # Static sitemap builder
│   └── test-clean-editorial-text.js # Standalone editorial text testing utility
│
├── taxmetrics/                # TaxMetrics 50-State & DC Paycheck Calculator
│   ├── index.html             # TaxMetrics main calculator interface
│   ├── css/                   # Theme and layout style definitions
│   ├── js/
│   │   ├── tax-data.js        # Statutory rates (2024–2027), FICA caps, and state brackets
│   │   ├── tax-engine.js      # Core paycheck math engine (FICA, federal, state, local)
│   │   └── app.js             # Interactive 3D pie canvas, dual sliders, and URL syncing
│   ├── scripts/
│   │   ├── build-states.js    # Compiles 51 state-specific static landing pages
│   │   ├── build-sitemap.js   # Generates XML sitemap for TaxMetrics
│   │   ├── states.json        # 51-jurisdiction state directory taxonomy
│   │   └── template.html      # Canonical state guide HTML template
│   └── [51 state html pages]  # Alaska through Wyoming dedicated calculator guides
│
├── tests/                     # Automated test suites executed via node:test
│   ├── editorial.test.js      # Grammar, punctuation, and classifier drift verification
│   └── taxmetrics.test.js     # 13 reference scenarios for FICA, 2027 brackets, and states
│
├── *.html                     # Category landing pages (politics, tech, finance, sports, etc.)
└── app.js                     # Client-side feed hydration, category filters, and modal logic
```

---

## 3. Serverless Functions & Routing Matrix

Vercel Hobby plan enforces a maximum limit of 12 serverless functions. The architecture consolidates all functionality into **6 discrete endpoints**:

| Function | Primary Route | Purpose |
| :--- | :--- | :--- |
| `api/admin.js` | `/api/admin/*`, `/api/newsletter/subscribe` | Secured editorial operations, subscriber management, CSRF-gated mutations, and file uploads. |
| `api/article.js` | `/chronicles/:slug`, `/category/:slug` | Server-side rendered chronicle dispatches with Schema.org `AnalysisNewsArticle` markup. |
| `api/home.js` | `/`, `/index.html`, `/category/:category` | Dynamic homepage feed with edge caching (`s-maxage=60`), edition filters, and search. |
| `api/honestly-biased-feed.js`| `/api/honestly-biased-feed` | Structured JSON dispatch syndication feed for external consumers. |
| `api/site-content.js` | `/api/site-content` | Public cacheable site configuration, alert tickers, and operational metadata. |
| `api/sitemap.js` | `/sitemap.xml`, `/rss.xml`, `/feed.xml` | Dynamically generated XML sitemap and RSS syndication feeds. |

---

## 4. TaxMetrics Engine Specifications

`TaxMetrics` calculates paycheck withholding across all 50 states and Washington, D.C. for tax years **2024 through 2027**:

1. **Tax Years Supported:**
   - **2027 (Projected):** Reflects projected ~2.8% inflation indexing under IRS Rev. Proc. guidelines ($16,600 Single/MFS, $33,200 MFJ, $24,925 HOH), SSA wage base cutoff of **$192,300**, and $25,000 401(k) deferral limit.
   - **2026 (Current):** IRS Rev. Proc. 2025-32 ($16,100 Single/MFS, $32,200 MFJ, $24,150 HOH), SSA wage base of **$184,500**, and $24,500 401(k) limit.
   - **2025 (Prior Year):** IRS Rev. Proc. 2024-40 ($15,750 Single/MFS, $31,500 MFJ, $23,625 HOH), SSA wage base of **$176,100**.
   - **2024 (Historical):** IRS Rev. Proc. 2023-34 ($14,600 Single/MFS, $29,200 MFJ, $21,900 HOH), SSA wage base of **$168,600**.
2. **Filing Statuses:**
   - Single (`single`)
   - Married Filing Jointly (`married`)
   - Married Filing Separately (`mfs`)
   - Head of Household (`hoh`)
3. **FICA Computation & Additional Medicare Surtax:**
   - Social Security: 6.20% up to statutory annual wage base.
   - Standard Medicare: 1.45% uncapped on all earned wage income.
   - Combined Sub-Cap FICA: **7.65%** formatted to 2-decimal precision.
   - Additional Medicare (+0.9%): Triggered strictly on earnings exceeding **$200,000** (Single / HOH), **$250,000** (MFJ), or **$125,000** (MFS).
4. **State Taxonomy:**
   - **No Income Tax (9 jurisdictions):** AK, FL, NV, NH, SD, TN, TX, WA, WY.
   - **Flat Income Tax (12 states):** AZ (2.50%), CO (4.40%), GA (5.09%), ID (5.30%), IL (4.95%), IN (2.95%), KY (3.50%), MI (4.25%), MS (4.00%), NC (3.99%), PA (3.07%), UT (4.55%).
   - **Progressive Tax (30 jurisdictions):** CA, NY, NJ, HI, OR, MN, WI, etc., including progressive local surcharges (New York City, Yonkers).

---

## 5. Security & Git Hygiene Standards

- **Static Asset Isolation:** Sensitive runtime files (`subscribers.json`, `poll-data.json`, `gnews-cache.json`), local test suites, and backend utility scripts are strictly blocked from static serving via `.vercelignore`.
- **Fail-Closed API Authentication:** All mutating endpoints in `api/_admin/` require cryptographic token validation; unauthenticated requests receive immediate `401 Unauthorized`.
- **Constant-Time CSRF Protection:** CSRF tokens are validated using `crypto.timingSafeEqual()` against HMAC-SHA256 signatures to eliminate timing side-channel exploits.
- **Dynamic Sharp Image Processing:** `sharp` is loaded dynamically (`await import('sharp')`) exclusively inside image optimization routines, eliminating cold-start execution drag on read-only serverless routes.
- **MIME & File Verification:** Upload endpoints validate binary headers and allow only verified image formats up to 5 MB.

---

## 6. Environment Variables

Configure the following environment variables in your Vercel project settings or `.env.local` for local execution:

```ini
# Supabase Connectivity
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Admin Authentication & Security
ADMIN_PASSWORD_HASH="sha256-hashed-admin-password"
ADMIN_SESSION_SECRET="cryptographically-random-32-byte-string"
CSRF_SECRET="cryptographically-random-32-byte-string"

# AI Summarization & Classification
GEMINI_API_KEY="your-google-gemini-api-key"
```

---

## 7. Local Development & Verification

### Running Automated Test Suites
Run the test suite using Node's native test runner (`node:test`):

```bash
npm test
```

### Building Responsive Media & Sitemaps
```bash
# Generate responsive WebP and AVIF assets
npm run build:images

# Rebuild static sitemaps
npm run build:sitemap

# Rebuild 51 TaxMetrics state guides
node taxmetrics/scripts/build-states.js
```
