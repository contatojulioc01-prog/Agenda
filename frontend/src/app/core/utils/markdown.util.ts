function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeUrl(rawUrl: string): string {
  const unescaped = rawUrl.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(unescaped)) {
    return escapeHtml(unescaped);
  }
  return '';
}

function formatInline(value: string): string {
  const codeTokens: string[] = [];
  let processed = value.replace(/`([^`\n]+)`/g, (_m, codeContent) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${codeContent}</code>`);
    return `\x00CODE_${idx}\x00`;
  });

  processed = processed.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s<)"']+|mailto:[^\s<)"']+|tel:[^\s<)"']+|[^\s<)"']+)\)/g, (_match, text, url) => {
    const safeHref = sanitizeUrl(url);
    if (!safeHref) return text;
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="markdown-link">${text}</a>`;
  });

  processed = processed.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/gi, (_match, prefix, rawUrl) => {
    let url = rawUrl;
    let trailing = '';
    const punctMatch = url.match(/[.,;:!?)]+$/);
    if (punctMatch) {
      trailing = punctMatch[0];
      url = url.slice(0, -trailing.length);
    }
    const safeHref = sanitizeUrl(url);
    if (!safeHref) return `${prefix}${rawUrl}`;
    return `${prefix}<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="markdown-link">${url}</a>${trailing}`;
  });

  processed = processed
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  processed = processed.replace(/\x00CODE_(\d+)\x00/g, (_m, idx) => codeTokens[Number(idx)] || '');

  return processed;
}

function tableCells(value: string): string[] | null {
  const normalized = value.trim().replace(/\\\|/g, '|');
  if (!normalized.includes('|')) return null;
  const withoutEdges = normalized.replace(/^\|/, '').replace(/\|$/, '');
  const cells = withoutEdges.split('|').map(cell => cell.trim());
  return cells.length > 1 ? cells : null;
}

function isTableDivider(cells: string[] | null): boolean {
  return !!cells?.length && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function renderBasicMarkdown(markdown: string): string {
  if (!markdown) return '';
  const lines = escapeHtml(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let quoteOpen = false;

  const closeList = (): void => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  const closeQuote = (): void => {
    if (quoteOpen) output.push('</blockquote>');
    quoteOpen = false;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headerCells = tableCells(line);
    const dividerCells = tableCells(lines[index + 1] || '');
    if (headerCells && dividerCells && headerCells.length === dividerCells.length && isTableDivider(dividerCells)) {
      closeList();
      closeQuote();
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const cells = tableCells(lines[index]);
        if (!cells) break;
        rows.push(cells);
        index += 1;
      }
      index -= 1;
      output.push('<div class="markdown-table-wrap"><table><thead><tr>');
      for (const cell of headerCells) output.push(`<th>${formatInline(cell)}</th>`);
      output.push('</tr></thead><tbody>');
      for (const row of rows) {
        output.push('<tr>');
        for (let cellIndex = 0; cellIndex < headerCells.length; cellIndex += 1) output.push(`<td>${formatInline(row[cellIndex] || '')}</td>`);
        output.push('</tr>');
      }
      output.push('</tbody></table></div>');
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^\s*&gt;\s?(.*)$/);

    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      output.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    if (quote) {
      closeList();
      if (!quoteOpen) { output.push('<blockquote>'); quoteOpen = true; }
      output.push(quote[1] ? `<p>${formatInline(quote[1])}</p>` : '<br>');
      continue;
    }

    closeQuote();
    if (unordered || ordered) {
      const nextList = unordered ? 'ul' : 'ol';
      if (list !== nextList) { closeList(); output.push(`<${nextList}>`); list = nextList; }
      const rawItem = (unordered || ordered)?.[1] || '';
      
      // Suporte a Checklist tipo - [ ] ou - [x]
      const checkMatch = rawItem.match(/^\[([ xX])\]\s*(.*)$/);
      if (checkMatch) {
        const isChecked = checkMatch[1].toLowerCase() === 'x';
        const checkText = checkMatch[2];
        output.push(`<li class="checklist-item ${isChecked ? 'is-checked' : ''}"><span class="mat-pseudo-checkbox ${isChecked ? 'mat-pseudo-checkbox-checked' : ''}"><svg viewBox="0 0 24 24" class="mat-pseudo-checkbox-check"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span><span class="checklist-text ${isChecked ? 'done' : ''}">${checkText ? formatInline(checkText) : '<br>'}</span></li>`);
      } else {
        output.push(`<li>${rawItem ? formatInline(rawItem) : '<br>'}</li>`);
      }
      continue;
    }

    closeList();
    output.push(line.trim() ? `<p>${formatInline(line)}</p>` : '<p><br></p>');
  }

  closeList();
  closeQuote();
  return output.join('');
}
