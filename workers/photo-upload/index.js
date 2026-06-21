const ALLOWED_ORIGINS = new Set(['https://reunion.klsll.com']);
const ALLOWED_MIMES = new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export function validateOrigin(origin) {
  return origin != null && ALLOWED_ORIGINS.has(origin);
}

export function validateMime(mime) {
  return ALLOWED_MIMES.has(mime);
}

export function sanitizeFilename(name) {
  return name
    .replace(/[/\\]/g, '')          // strip path separators
    .replace(/[^\x20-\x7E]/g, '')   // strip non-ASCII / non-printable
    .replace(/\s+/g, '-')           // spaces → dashes
    .slice(0, 128);                 // truncate
}

async function validateToken(pbUrl, token) {
  if (!token) return null;
  try {
    const res = await fetch(`${pbUrl}/api/collections/users/auth-refresh`, {
      method: 'POST',
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.record || !data.record.approved) return null;
    return data.record.id;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const corsHeaders = {
      'Access-Control-Allow-Origin': validateOrigin(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!validateOrigin(origin)) {
      return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
    }

    const token = request.headers.get('Authorization');
    const userId = await validateToken(env.PB_URL, token);
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid multipart body' }, { status: 400, headers: corsHeaders });
    }

    const file = formData.get('image');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'No image file provided' }, { status: 400, headers: corsHeaders });
    }

    if (!validateMime(file.type)) {
      return Response.json({ error: `File type ${file.type} not allowed` }, { status: 400, headers: corsHeaders });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return Response.json({ error: 'File exceeds 10MB limit' }, { status: 400, headers: corsHeaders });
    }

    const safeName = sanitizeFilename(file.name || 'photo.jpg');
    const key = `photos/${userId}/${Date.now()}-${safeName}`;

    await env.PHOTOS_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: file.type },
    });

    const url = `https://photos.reunion.klsll.com/${key}`;
    return Response.json({ url }, { status: 200, headers: corsHeaders });
  },
};
