import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { getLegalDocument, legalDocumentVersion, type LegalSlug } from '@/lib/legal-documents';
import '../legal/legal.css';

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      if (/^(https?:|mailto:|tel:|\/)/.test(href!)) return <a key={index} href={href}>{label}</a>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  })}</>;
}

function MarkdownContent({ source }: { source: string }) {
  const lines = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').split(/\r?\n/);
  const blocks: Array<{ type: 'heading' | 'paragraph' | 'list'; level?: number; text: string; ordered?: boolean }> = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]!.trim();
    if (!line) { index++; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]! }); index++; continue; }
    const list = /^([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      const ordered = /^\d/.test(list[1]!);
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[index]!);
        if (!item) break;
        items.push(item[1]!); index++;
      }
      blocks.push({ type: 'list', text: items.join('\n'), ordered }); continue;
    }
    const paragraph = [line]; index++;
    while (index < lines.length && lines[index]!.trim() && !/^(#{1,3})\s+/.test(lines[index]!.trim()) && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[index]!)) paragraph.push(lines[index++]!.trim());
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return <div className="legal-document-body">{blocks.map((block, index) => {
    if (block.type === 'heading') {
      if (block.level === 1) return null;
      if (block.level === 2) return <h2 key={index}><InlineMarkdown text={block.text}/></h2>;
      return <h3 key={index}><InlineMarkdown text={block.text}/></h3>;
    }
    if (block.type === 'list') {
      const Tag = block.ordered ? 'ol' : 'ul';
      return <Tag key={index}>{block.text.split('\n').map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item}/></li>)}</Tag>;
    }
    return <p key={index}><InlineMarkdown text={block.text}/></p>;
  })}</div>;
}

export async function LegalDocumentPage({ slug }: { slug: LegalSlug }) {
  const document = getLegalDocument(slug);
  let source: string;
  try { source = await readFile(path.join(process.cwd(), 'content/legal', document.file), 'utf8'); }
  catch { notFound(); }
  return <main className="legal-shell legal-document-shell">
    <header className="legal-topbar"><BrandLogo variant="compact" href="/"/><ThemeToggle/></header>
    <p className="legal-status">VERSION {legalDocumentVersion} · DERNIÈRE MISE À JOUR : 6 OCTOBRE 2026</p>
    <h1>{document.title}</h1>
    <p className="legal-intro">{document.purpose}</p>
    <MarkdownContent source={source}/>
    <p className="legal-back"><Link href="/legal">← Tous les documents</Link></p>
  </main>;
}
