import { SectionMarker } from '../types/teleprompter';

const SECTION_LINE_REGEX = /^##\s*\[SECTION:\s*([^\]]+)\]\s*$/i;

export function parseSectionLine(line: string): string | null {
  const match = line.trim().match(SECTION_LINE_REGEX);
  return match ? match[1].trim() : null;
}

export function formatSectionLine(title: string): string {
  const clean = title.replace(/[\[\]\r\n]/g, '').trim() || 'New Section';
  return `## [SECTION: ${clean}]`;
}

export function extractSectionMarkers(markdown: string): SectionMarker[] {
  const blocks = splitMarkdownBlocks(markdown);
  const markers: SectionMarker[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'section') {
      markers.push({
        index: markers.length,
        title: block.title,
        blockIndex,
      });
    }
  });
  return markers;
}

export type PrompterBlock =
  | { type: 'section'; title: string }
  | { type: 'cue'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; lines: string[] };

export function splitMarkdownBlocks(markdown: string): PrompterBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: PrompterBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const sectionTitle = parseSectionLine(trimmed);
    if (sectionTitle !== null) {
      blocks.push({ type: 'section', title: sectionTitle });
      i++;
      continue;
    }

    if (/^\[[^\]]+\]$/.test(trimmed)) {
      blocks.push({ type: 'cue', text: trimmed });
      i++;
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // Group consecutive non-empty prose lines into a paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const nextTrimmed = lines[i].trim();
      if (
        !nextTrimmed ||
        parseSectionLine(nextTrimmed) !== null ||
        /^\[[^\]]+\]$/.test(nextTrimmed) ||
        /^[-*+]\s+/.test(nextTrimmed)
      ) {
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', lines: paraLines });
    }
  }

  return blocks;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineMarkdownToHtml(line: string): string {
  // Temporarily protect <u> and </u> tags so we don't escape them
  const U_OPEN = '%%U_OPEN%%';
  const U_CLOSE = '%%U_CLOSE%%';
  let safe = line
    .replace(/<u>/gi, U_OPEN)
    .replace(/<\/u>/gi, U_CLOSE);

  safe = escapeHtml(safe);

  // Restore <u>...</u>
  safe = safe
    .replace(new RegExp(U_OPEN, 'g'), '<u>')
    .replace(new RegExp(U_CLOSE, 'g'), '</u>');

  // Bold **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  safe = safe.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  return safe;
}

export function markdownToEditorHtml(markdown: string): string {
  const blocks = splitMarkdownBlocks(markdown);
  if (blocks.length === 0) return '<p><br></p>';

  return blocks
    .map((block) => {
      if (block.type === 'section') {
        return `<div data-section-marker="true" data-section-title="${escapeHtml(
          block.title
        ).replace(/"/g, '&quot;')}" contenteditable="false" class="cue-section-block"><span class="cue-section-label">SECTION</span><span class="cue-section-title">${escapeHtml(
          block.title
        )}</span></div>`;
      }
      if (block.type === 'cue') {
        return `<p data-cue="true">${escapeHtml(block.text)}</p>`;
      }
      if (block.type === 'list') {
        const lis = block.items
          .map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`)
          .join('');
        return `<ul>${lis}</ul>`;
      }
      const joined = block.lines.map(inlineMarkdownToHtml).join('<br>');
      return `<p>${joined}</p>`;
    })
    .join('');
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\u00A0/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toUpperCase();

  if (tag === 'BR') return '\n';

  const inner = Array.from(el.childNodes).map(serializeInlineNode).join('');

  if (tag === 'STRONG' || tag === 'B') {
    return inner.trim() ? `**${inner}**` : inner;
  }
  if (tag === 'EM' || tag === 'I') {
    return inner.trim() ? `*${inner}*` : inner;
  }
  if (tag === 'U') {
    return inner.trim() ? `<u>${inner}</u>` : inner;
  }
  if (tag === 'SPAN') {
    // Handle CSS-styled spans created by some browsers' execCommand
    const fw = el.style.fontWeight;
    const fs = el.style.fontStyle;
    const td = el.style.textDecoration || el.style.textDecorationLine;
    let out = inner;
    if (td && td.includes('underline') && out.trim()) out = `<u>${out}</u>`;
    if (fs === 'italic' && out.trim()) out = `*${out}*`;
    if ((fw === 'bold' || fw === '700' || fw === '600') && out.trim()) {
      out = `**${out}**`;
    }
    return out;
  }

  return inner;
}

export function editorHtmlToMarkdown(rootEl: HTMLElement): string {
  const chunks: string[] = [];

  const processBlockNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent ?? '').replace(/\u00A0/g, ' ').trim();
      if (txt) chunks.push(txt);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();

    if (el.dataset.sectionMarker === 'true') {
      const title =
        el.dataset.sectionTitle ||
        el.querySelector('.cue-section-title')?.textContent ||
        'Section';
      chunks.push(formatSectionLine(title));
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      const items = Array.from(el.querySelectorAll(':scope > li'))
        .map((li) => `- ${serializeInlineNode(li).replace(/\n+/g, ' ').trim()}`)
        .filter((line) => line !== '-');
      if (items.length > 0) {
        chunks.push(items.join('\n'));
      }
      return;
    }

    if (tag === 'P' || tag === 'DIV' || tag === 'H1' || tag === 'H2' || tag === 'H3') {
      // Check if DIV contains nested UL or section markers
      const hasBlockChildren = Array.from(el.children).some((child) => {
        const cTag = child.tagName.toUpperCase();
        return (
          cTag === 'UL' ||
          cTag === 'OL' ||
          cTag === 'P' ||
          cTag === 'DIV' ||
          (child as HTMLElement).dataset?.sectionMarker === 'true'
        );
      });

      if (hasBlockChildren) {
        Array.from(el.childNodes).forEach(processBlockNode);
        return;
      }

      const content = Array.from(el.childNodes)
        .map(serializeInlineNode)
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (content) {
        chunks.push(content);
      }
      return;
    }

    const fallback = serializeInlineNode(el).trim();
    if (fallback) chunks.push(fallback);
  };

  Array.from(rootEl.childNodes).forEach(processBlockNode);

  return chunks.join('\n\n');
}

export type InlineToken = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  isCue?: boolean;
};

export function parseInlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Match **bold**, *italic*, <u>underline</u>, or [CUE]
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|<u>[\s\S]*?<\/u>|\[[^\]]+\])/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push({ text: token.slice(1, -1), italic: true });
    } else if (token.toLowerCase().startsWith('<u>') && token.toLowerCase().endsWith('</u>')) {
      tokens.push({ text: token.slice(3, -4), underline: true });
    } else if (token.startsWith('[') && token.endsWith(']')) {
      tokens.push({ text: token, isCue: true });
    } else {
      tokens.push({ text: token });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex) });
  }

  return tokens;
}
