"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthProvider";
import PresentationSessionForm from "../../components/PresentationSessionForm";

export default function NewPresentationPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const [redirecting, setRedirecting] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/");
        }
    }, [authLoading, router, user]);

    if (authLoading || !user) {
        return (
            <main className="prepare-page">
                <div className="prepare-container">
                    <p className="subtitle">계정 정보를 확인하는 중입니다.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="prepare-page">
            <div className="prepare-container">
                <header className="prepare-header">
                    <button type="button" className="sim-setup-back" onClick={() => router.push("/dashboard")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        대시보드
                    </button>
                    <h1>발표 추가</h1>
                    <p>하나의 발표 세션 안에서 여러 번의 연습 결과를 관리합니다.</p>
                </header>

                {redirecting ? (
                    <section className="prepare-section">
                        <p className="subtitle">발표 세션으로 이동하는 중입니다.</p>
                    </section>
                ) : (
                    <PresentationSessionForm
                        user={user}
                        mode="create"
                        formId="new-presentation"
                        onCancel={() => router.push("/dashboard")}
                        onSaved={(savedPresentation) => {
                            setRedirecting(true);
                            router.push(`/presentations/${savedPresentation.id}`);
                        }}
                    />
                )}
            </div>
        </main>
    );
}
