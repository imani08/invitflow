import { NextResponse } from 'next/server';
import { requestOwnProfile } from '@/lib/profile-api';

export const runtime = 'nodejs';

async function forward(request: Request, method: 'GET' | 'POST' | 'DELETE') {
  if (method !== 'GET') {
    const expectedOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    if (request.headers.get('origin') !== expectedOrigin)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const response = await requestOwnProfile(method, undefined, 'deletion-request');
  const body = await response.json().catch(() => ({ error: 'invalid_profile_response' }));
  const result = NextResponse.json(body, { status: response.status });
  result.headers.set('Cache-Control', 'no-store');
  return result;
}

export async function GET(request: Request) {
  return forward(request, 'GET');
}
export async function POST(request: Request) {
  return forward(request, 'POST');
}
export async function DELETE(request: Request) {
  return forward(request, 'DELETE');
}
