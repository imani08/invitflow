import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLegalDocument, isLegalSlug, legalDocuments } from '@/lib/legal-documents';
import { LegalDocumentPage } from '@/app/lib/legal-document-page';

export const dynamicParams = false;
export function generateStaticParams() {
  return legalDocuments.map((document) => ({ slug: document.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: isLegalSlug(slug) ? `${getLegalDocument(slug).title} · InvitaFlow` : 'Document légal', robots: { index: false, follow: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  return <LegalDocumentPage slug={slug} />;
}
