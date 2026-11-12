import { NextResponse } from "next/server";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const source = searchParams.get("url");

        if (!source) {
            return NextResponse.json({ error: "PDF URL이 필요합니다." }, { status: 400 });
        }

        let sourceUrl;
        try {
            sourceUrl = new URL(source);
        } catch {
            return NextResponse.json({ error: "PDF URL 형식이 올바르지 않습니다." }, { status: 400 });
        }

        if (!["http:", "https:"].includes(sourceUrl.protocol)) {
            return NextResponse.json({ error: "HTTP(S) PDF URL만 지원합니다." }, { status: 400 });
        }

        const upstream = await fetch(sourceUrl.toString(), { cache: "no-store" });
        if (!upstream.ok) {
            return NextResponse.json(
                { error: `PDF를 가져오지 못했습니다. (HTTP ${upstream.status})` },
                { status: upstream.status }
            );
        }

        const contentType = upstream.headers.get("content-type") || "application/pdf";
        const body = await upstream.arrayBuffer();

        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=300",
            },
        });
    } catch (error) {
        console.error("[pdf-proxy] PDF fetch failed:", error);
        return NextResponse.json({ error: error.message || "PDF를 가져오지 못했습니다." }, { status: 500 });
    }
}
