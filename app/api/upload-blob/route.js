import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request) {
    try {
        const { searchParams } = new URL(request.url);
        const filename = searchParams.get('filename') ?? 'upload';
        const contentType = request.headers.get('content-type') || 'video/mp4';

        console.log('[Blob] 서버 업로드 시작:', filename, contentType);

        const blob = await put(filename, request.body, {
            access: 'public',
            addRandomSuffix: true,
            contentType,
        });

        console.log('[Blob] 업로드 완료:', blob.url);
        return NextResponse.json({ url: blob.url, pathname: blob.pathname });

    } catch (error) {
        console.error('[Blob] 업로드 오류:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
}
