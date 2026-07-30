// api/admin/upload.js - Server-side image upload to Supabase Storage with Sharp optimization
// Replaces client-side base64 data URLs with proper CDN-hosted, optimized images

const { supabase } = require('../../db/client');
const sharp = require('sharp');

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB input limit
const BUCKET = 'article-images'; // Must exist in Supabase Storage

// Optimization settings
const VARIANTS = [
  { suffix: 'thumb', width: 400, quality: 75 },
  { suffix: 'preview', width: 1200, quality: 80 },
  { suffix: 'full', width: 2400, quality: 85 },
];

async function optimizeImage(inputBuffer) {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  
  const results = {
    original: { buffer: inputBuffer, type: 'original', width: metadata.width, height: metadata.height },
    variants: {},
    avif: null,
  };

  // Generate WebP variants
  for (const variant of VARIANTS) {
    if (variant.width < metadata.width) {
      const buffer = await image
        .clone()
        .resize(variant.width, null, { withoutEnlargement: true })
        .webp({ quality: variant.quality })
        .toBuffer();
      results.variants[variant.suffix] = {
        buffer,
        type: 'image/webp',
        width: variant.width,
        height: Math.round(metadata.height * (variant.width / metadata.width)),
      };
    }
  }

  // Generate AVIF (modern browsers)
  try {
    const avifBuffer = await image
      .clone()
      .resize(1200, null, { withoutEnlargement: true })
      .avif({ quality: 50 })
      .toBuffer();
    results.avif = {
      buffer: avifBuffer,
      type: 'image/avif',
      width: Math.min(metadata.width, 1200),
    };
  } catch (e) {
    console.warn('AVIF generation failed:', e.message);
  }

  return { results, metadata };
}

async function uploadToSupabase(bucket, path, buffer, contentType, cacheControl = '31536000, immutable') {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, cacheControl, upsert: false });
  return { data, error };
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Basic auth check
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && req.method === 'POST') {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      res.setHeader('WWW-Authenticate', 'Basic realm="CMS Admin"');
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
      const [user, pass] = decoded.split(':');
      if (user !== process.env.ADMIN_USERNAME || pass !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth header' });
    }
  }

  try {
    // Parse multipart form data
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Content-Type must be multipart/form-data' });
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const body = buffer.toString('binary');
    
    // Extract boundary
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) return res.status(400).json({ error: 'No boundary in multipart' });
    const boundary = boundaryMatch[1];
    
    // Parse parts
    const parts = body.split(`--${boundary}`).map(p => p.trim()).filter(p => p && p !== '--');
    
    let fileBuffer = null;
    let fileName = null;
    let fileType = null;
    
    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd);
      const content = part.slice(headerEnd + 4);
      
      if (headers.includes('name="image"')) {
        const fileNameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);
        
        fileName = fileNameMatch ? fileNameMatch[1] : 'upload';
        fileType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        
        const cleanContent = content.endsWith('\r\n') ? content.slice(0, -2) : content;
        fileBuffer = Buffer.from(cleanContent, 'binary');
      }
    }
    
    if (!fileBuffer) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Validate
    if (!ALLOWED_TYPES.includes(fileType)) {
      return res.status(400).json({ error: `Invalid file type: ${fileType}. Allowed: ${ALLOWED_TYPES.join(', ')}` });
    }
    if (fileBuffer.length > MAX_SIZE) {
      return res.status(400).json({ error: `File too large: ${(fileBuffer.length/1024/1024).toFixed(2)}MB. Max: ${MAX_SIZE/1024/1024}MB` });
    }
    
    // Optimize image with Sharp
    let optimized;
    try {
      const { results, metadata } = await optimizeImage(fileBuffer);
      optimized = { results, metadata };
      console.log(`[upload] Original: ${fileBuffer.length} bytes (${metadata.width}x${metadata.height}), Variants: ${Object.keys(results.variants).join(', ')}`);
    } catch (err) {
      console.error('Sharp optimization failed:', err);
      return res.status(500).json({ error: `Image optimization failed: ${err.message}` });
    }

    // Generate unique base filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const baseName = `${timestamp}-${random}`;
    
    if (!supabase) {
      console.warn('[upload] Supabase offline. Falling back to mock URL.');
      return res.json({ 
        url: `./assets/hero-bg.png`, 
        path: `local-mocks/articles/${baseName}`,
        size: fileBuffer.length,
        type: fileType,
        optimized: false
      });
    }
    
    // Upload all variants to Supabase Storage
    const uploaded = {};
    const errors = [];
    
    // Upload WebP variants
    for (const [suffix, variant] of Object.entries(optimized.results.variants)) {
      const variantPath = `articles/${baseName}-${suffix}.webp`;
      const { data, error } = await uploadToSupabase(BUCKET, variantPath, variant.buffer, 'image/webp');
      if (error) {
        errors.push({ variant: suffix, error: error.message });
      } else {
        uploaded[suffix] = variantPath;
      }
    }

    // Upload AVIF
    if (optimized.results.avif) {
      const avifPath = `articles/${baseName}.avif`;
      const { data, error } = await uploadToSupabase(BUCKET, avifPath, optimized.results.avif.buffer, 'image/avif');
      if (error) {
        errors.push({ variant: 'avif', error: error.message });
      } else {
        uploaded.avif = avifPath;
      }
    }

    if (errors.length > 0 && !uploaded.preview) {
      console.error('All uploads failed:', errors);
      return res.status(500).json({ error: 'All uploads failed', details: errors });
    }

    // Get public URLs
    const variantUrls = {};
    for (const [suffix, path] of Object.entries(uploaded)) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      variantUrls[suffix] = data.publicUrl;
    }

    // Primary URL is the preview (1200w) WebP
    const primaryUrl = variantUrls.preview || variantUrls.full || variantUrls.thumb || variantUrls.avif;
    
    // Calculate savings
    const totalOptimized = Object.values(optimized.results.variants).reduce((sum, v) => sum + v.buffer.length, 0);
    if (optimized.results.avif) totalOptimized += optimized.results.avif.buffer.length;
    const savings = ((1 - totalOptimized / fileBuffer.length) * 100).toFixed(1);
    
    console.log(`[upload] Done: ${Object.keys(uploaded).length} variants, ${savings}% smaller`);

    return res.json({ 
      url: primaryUrl,                    // Primary URL for <img src>
      variants: variantUrls,              // Responsive variants for <picture><source>
      path: uploaded.preview || uploaded.full || uploaded.thumb,
      size: optimized.results.variants.preview?.buffer.length || fileBuffer.length,
      type: 'image/webp',
      originalSize: fileBuffer.length,
      originalType: fileType,
      savingsPercent: parseFloat(savings),
      optimized: true,
      width: optimized.results.variants.preview?.width || optimized.metadata.width,
      height: optimized.results.variants.preview?.height || optimized.metadata.height,
    });
    
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
};