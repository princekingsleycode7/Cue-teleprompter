import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  BookmarkPlus,
  Italic,
  List,
  Underline,
} from 'lucide-react';
import {
  editorHtmlToMarkdown,
  formatSectionLine,
  markdownToEditorHtml,
} from '../utils/markdown';

interface RichScriptEditorProps {
  scriptId: string;
  content: string;
  onChange: (nextMarkdown: string) => void;
}

export function RichScriptEditor({
  scriptId,
  content,
  onChange,
}: RichScriptEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastEmittedMarkdownRef = useRef<string>(content);

  const [editorMode, setEditorMode] = useState<'visual' | 'markdown'>('visual');
  const [sectionPromptOpen, setSectionPromptOpen] = useState(false);
  const [sectionTitleInput, setSectionTitleInput] = useState('');
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    unorderedList: false,
  });

  // Sync HTML when switching scripts or switching back from markdown mode or external updates
  useEffect(() => {
    if (editorMode !== 'visual') return;
    const el = editorRef.current;
    if (!el) return;

    if (content !== lastEmittedMarkdownRef.current || el.innerHTML === '') {
      el.innerHTML = markdownToEditorHtml(content);
      lastEmittedMarkdownRef.current = content;
    }
  }, [content, scriptId, editorMode]);

  useEffect(() => {
    if (editorMode === 'visual' && editorRef.current) {
      editorRef.current.innerHTML = markdownToEditorHtml(content);
      lastEmittedMarkdownRef.current = content;
    }
  }, [editorMode]);

  const updateToolbarState = () => {
    if (editorMode !== 'visual') return;
    try {
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
      });
    } catch {
      // ignore selection edge cases
    }
  };

  const emitFromEditor = () => {
    const el = editorRef.current;
    if (!el) return;
    const md = editorHtmlToMarkdown(el);
    lastEmittedMarkdownRef.current = md;
    onChange(md);
    updateToolbarState();
  };

  const execFormat = (command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList') => {
    if (editorMode === 'markdown') {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      const selected = content.slice(start, end) || 'text';
      let wrapped = selected;
      if (command === 'bold') wrapped = `**${selected}**`;
      if (command === 'italic') wrapped = `*${selected}*`;
      if (command === 'underline') wrapped = `<u>${selected}</u>`;
      if (command === 'insertUnorderedList') wrapped = `\n- ${selected}`;
      const next = content.slice(0, start) + wrapped + content.slice(end);
      lastEmittedMarkdownRef.current = next;
      onChange(next);
      return;
    }

    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false);
    emitFromEditor();
  };

  const insertCueToken = (cue: string) => {
    if (editorMode === 'markdown') {
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? content.length;
      const end = ta?.selectionEnd ?? content.length;
      const next = `${content.slice(0, start)}\n\n${cue}\n\n${content.slice(end)}`;
      lastEmittedMarkdownRef.current = next;
      onChange(next);
      return;
    }

    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const html = `<p data-cue="true">${cue}</p><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    emitFromEditor();
  };

  const handleInsertSectionMarker = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sectionTitleInput.trim() || 'New Section';
    setSectionTitleInput('');
    setSectionPromptOpen(false);

    if (editorMode === 'markdown') {
      const line = formatSectionLine(cleanTitle);
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? content.length;
      const end = ta?.selectionEnd ?? content.length;
      const next = `${content.slice(0, start)}\n\n${line}\n\n${content.slice(end)}`;
      lastEmittedMarkdownRef.current = next;
      onChange(next);
      return;
    }

    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const safeTitle = cleanTitle
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const markerHtml = `<div data-section-marker="true" data-section-title="${safeTitle}" contenteditable="false" class="cue-section-block"><span class="cue-section-label">SECTION</span><span class="cue-section-title">${safeTitle}</span></div><p><br></p>`;
    document.execCommand('insertHTML', false, markerHtml);
    emitFromEditor();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emitFromEditor();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Airy Formatting Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('bold')}
            aria-label="Bold"
            title="Bold"
            className={`min-w-[40px] min-h-[40px] px-2.5 rounded-lg border flex items-center justify-center transition-colors ${
              activeFormats.bold && editorMode === 'visual'
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Bold className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('italic')}
            aria-label="Italic"
            title="Italic"
            className={`min-w-[40px] min-h-[40px] px-2.5 rounded-lg border flex items-center justify-center transition-colors ${
              activeFormats.italic && editorMode === 'visual'
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Italic className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('underline')}
            aria-label="Underline"
            title="Underline"
            className={`min-w-[40px] min-h-[40px] px-2.5 rounded-lg border flex items-center justify-center transition-colors ${
              activeFormats.underline && editorMode === 'visual'
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Underline className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => execFormat('insertUnorderedList')}
            aria-label="Bullet list"
            title="Bullet Points"
            className={`min-w-[40px] min-h-[40px] px-2.5 rounded-lg border flex items-center justify-center transition-colors ${
              activeFormats.unorderedList && editorMode === 'visual'
                ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <List className="w-4 h-4" aria-hidden="true" />
          </button>

          <span className="h-5 w-[1px] bg-zinc-800 mx-1 hidden sm:inline-block" aria-hidden="true" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setSectionPromptOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              sectionPromptOpen
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                : 'bg-zinc-900/90 border-zinc-800 text-amber-300 hover:border-amber-500/40'
            }`}
          >
            <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Section
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertCueToken('[PAUSE 2s]')}
            className="min-h-[40px] px-3 text-xs font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            + Pause
          </button>
        </div>

        {/* Visual / Markdown Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setEditorMode('visual')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              editorMode === 'visual'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Rich Text
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('markdown')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              editorMode === 'markdown'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Markdown
          </button>
        </div>
      </div>

      {/* Inline Section Marker Prompt */}
      {sectionPromptOpen && (
        <form
          onSubmit={handleInsertSectionMarker}
          className="mt-4 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-zinc-900/90 border border-amber-500/35"
        >
          <input
            type="text"
            autoFocus
            value={sectionTitleInput}
            onChange={(e) => setSectionTitleInput(e.target.value)}
            placeholder="Section name (e.g., Live Product Demo)"
            aria-label="Section marker title"
            className="flex-1 min-w-[180px] px-3 py-2 min-h-[40px] text-sm bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="submit"
            className="px-4 py-2 min-h-[40px] text-xs font-semibold bg-amber-500 text-zinc-950 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
          >
            Insert Marker
          </button>
          <button
            type="button"
            onClick={() => setSectionPromptOpen(false)}
            className="px-3 py-2 min-h-[40px] text-xs font-medium text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Spacious Writing Surface */}
      {editorMode === 'visual' ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitFromEditor}
          onKeyUp={updateToolbarState}
          onMouseUp={updateToolbarState}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
          aria-label="Rich text presentation script editor"
          className="rich-script-editor flex-1 min-h-[360px] py-6 text-base sm:text-[17px] leading-[1.75] text-zinc-200 focus:outline-none font-prompter-sans"
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            lastEmittedMarkdownRef.current = e.target.value;
            onChange(e.target.value);
          }}
          placeholder="Write your script in Markdown. Use **bold**, *italic*, <u>underline</u>, - bullets, and ## [SECTION: Title]."
          aria-label="Markdown presentation script source"
          className="flex-1 min-h-[360px] py-6 resize-none bg-transparent text-zinc-200 placeholder:text-zinc-600 text-sm sm:text-base leading-relaxed font-mono focus:outline-none"
        />
      )}
    </div>
  );
}
