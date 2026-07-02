import { NextResponse } from 'next/server';

// Proxies /api/fal/* -> https://queue.fal.run/*
// New file, zero overlap with the existing Muapi proxy routes — mirrors the
// same pattern as app/api/api/v1/[[...path]]/route.js so it stays
// consistent with how this app already handles browser CORS for its
// upstream API. The browser sends its fal.ai key as `x-fal-key`; we convert
// it to the `Authorization: Key ...` header fal's Queue API expects
// (see fal.ai/docs/model-endpoints/queue).
const FAL_BASE = 'https://queue.fal.run';

function getFalKey(request) {
    return request.headers.get('x-fal-key');
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('x-fal-key');
    return headers;
}

async function proxy(request, { params }, method) {
    const slug = await params;
    const pathSegments = slug.path || [];
    const path = pathSegments.join('/');

    const { search } = new URL(request.url);
    const targetUrl = `${FAL_BASE}/${path}${search}`;

    const headers = cleanHeaders(request);
    const falKey = getFalKey(request);
    if (!falKey) {
        return NextResponse.json({ error: 'Missing x-fal-key header' }, { status: 401 });
    }
    headers.set('Authorization', `Key ${falKey}`);

    try {
        const body = (method !== 'GET' && method !== 'HEAD') ? await request.arrayBuffer() : undefined;
        const response = await fetch(targetUrl, { method, headers, body });
        const contentType = response.headers.get('content-type') || 'application/json';
        const data = await response.arrayBuffer();
        return new NextResponse(data, {
            status: response.status,
            headers: { 'content-type': contentType },
        });
    } catch (error) {
        console.error(`[fal proxy ${method}] ${targetUrl} failed:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request, ctx) {
    return proxy(request, ctx, 'GET');
}

export async function POST(request, ctx) {
    return proxy(request, ctx, 'POST');
}

export async function PUT(request, ctx) {
    return proxy(request, ctx, 'PUT');
}
