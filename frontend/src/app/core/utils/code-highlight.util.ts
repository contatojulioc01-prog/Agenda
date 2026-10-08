/**
 * Utilitário para identificação de tipos de arquivos, linguagens de programação
 * e formatação / syntax highlighting em pré-visualizações.
 */

export interface FileTypeInfo {
  id: string;
  name: string;
  category: 'code' | 'image' | 'pdf' | 'audio' | 'video' | 'archive' | 'sheet' | 'document' | 'other';
  icon: string;
  color: string;
  extension: string;
}

const LANGUAGE_MAP: Record<string, { id: string; name: string; icon: string; color: string }> = {
  // Web & Scripting
  ts: { id: 'typescript', name: 'TypeScript', icon: 'code', color: '#3178c6' },
  tsx: { id: 'typescript', name: 'TypeScript (React)', icon: 'code', color: '#3178c6' },
  js: { id: 'javascript', name: 'JavaScript', icon: 'javascript', color: '#f7df1e' },
  mjs: { id: 'javascript', name: 'JavaScript (ESM)', icon: 'javascript', color: '#f7df1e' },
  cjs: { id: 'javascript', name: 'JavaScript (CommonJS)', icon: 'javascript', color: '#f7df1e' },
  jsx: { id: 'javascript', name: 'JavaScript (React)', icon: 'javascript', color: '#61dafb' },
  html: { id: 'html', name: 'HTML', icon: 'html', color: '#e34f26' },
  htm: { id: 'html', name: 'HTML', icon: 'html', color: '#e34f26' },
  css: { id: 'css', name: 'CSS', icon: 'css', color: '#1572b6' },
  scss: { id: 'scss', name: 'SCSS', icon: 'style', color: '#c69' },
  sass: { id: 'scss', name: 'SASS', icon: 'style', color: '#c69' },
  less: { id: 'css', name: 'LESS', icon: 'style', color: '#1d365d' },
  json: { id: 'json', name: 'JSON', icon: 'data_object', color: '#f59e0b' },
  jsonc: { id: 'json', name: 'JSON with Comments', icon: 'data_object', color: '#f59e0b' },
  xml: { id: 'xml', name: 'XML', icon: 'code', color: '#0060ac' },
  svg: { id: 'xml', name: 'SVG (XML)', icon: 'image', color: '#ff9900' },
  yaml: { id: 'yaml', name: 'YAML', icon: 'settings', color: '#cb171e' },
  yml: { id: 'yaml', name: 'YAML', icon: 'settings', color: '#cb171e' },
  md: { id: 'markdown', name: 'Markdown', icon: 'description', color: '#083fa1' },
  markdown: { id: 'markdown', name: 'Markdown', icon: 'description', color: '#083fa1' },

  // Backend, Systems & General Purpose
  py: { id: 'python', name: 'Python', icon: 'terminal', color: '#3776ab' },
  pyw: { id: 'python', name: 'Python GUI', icon: 'terminal', color: '#3776ab' },
  cs: { id: 'csharp', name: 'C# (.NET)', icon: 'code', color: '#68217a' },
  java: { id: 'java', name: 'Java', icon: 'coffee', color: '#b07219' },
  cpp: { id: 'cpp', name: 'C++', icon: 'memory', color: '#00599c' },
  cxx: { id: 'cpp', name: 'C++', icon: 'memory', color: '#00599c' },
  cc: { id: 'cpp', name: 'C++', icon: 'memory', color: '#00599c' },
  c: { id: 'c', name: 'C', icon: 'memory', color: '#555555' },
  h: { id: 'c', name: 'C/C++ Header', icon: 'memory', color: '#a8b9cc' },
  hpp: { id: 'cpp', name: 'C++ Header', icon: 'memory', color: '#a8b9cc' },
  go: { id: 'go', name: 'Go (Golang)', icon: 'code', color: '#00add8' },
  rs: { id: 'rust', name: 'Rust', icon: 'precision_manufacturing', color: '#dea584' },
  php: { id: 'php', name: 'PHP', icon: 'php', color: '#777bb4' },
  rb: { id: 'ruby', name: 'Ruby', icon: 'diamond', color: '#cc342d' },
  sql: { id: 'sql', name: 'SQL Query / Schema', icon: 'storage', color: '#00758f' },
  sh: { id: 'shell', name: 'Shell Script', icon: 'terminal', color: '#89e051' },
  bash: { id: 'shell', name: 'Bash Script', icon: 'terminal', color: '#89e051' },
  zsh: { id: 'shell', name: 'Zsh Script', icon: 'terminal', color: '#89e051' },
  ps1: { id: 'powershell', name: 'PowerShell', icon: 'terminal', color: '#012456' },
  bat: { id: 'batch', name: 'Windows Batch', icon: 'terminal', color: '#c1f12e' },
  cmd: { id: 'batch', name: 'Windows CMD', icon: 'terminal', color: '#c1f12e' },
  kt: { id: 'kotlin', name: 'Kotlin', icon: 'code', color: '#a97bff' },
  kts: { id: 'kotlin', name: 'Kotlin Script', icon: 'code', color: '#a97bff' },
  swift: { id: 'swift', name: 'Swift', icon: 'code', color: '#f05138' },
  dart: { id: 'dart', name: 'Dart', icon: 'code', color: '#0175c2' },
  lua: { id: 'lua', name: 'Lua', icon: 'code', color: '#000080' },
  r: { id: 'r', name: 'R', icon: 'analytics', color: '#198ce7' },
  env: { id: 'config', name: 'Environment Config', icon: 'settings', color: '#ecd53f' },
  ini: { id: 'config', name: 'INI Config', icon: 'settings', color: '#64748b' },
  conf: { id: 'config', name: 'Config File', icon: 'settings', color: '#64748b' },
  toml: { id: 'config', name: 'TOML Config', icon: 'settings', color: '#9c4221' },
  txt: { id: 'text', name: 'Texto Puro', icon: 'article', color: '#64748b' },
  log: { id: 'text', name: 'Log', icon: 'history', color: '#64748b' },
  csv: { id: 'text', name: 'CSV', icon: 'table_chart', color: '#107c41' },
  tsv: { id: 'text', name: 'TSV', icon: 'table_chart', color: '#107c41' },
};

export function detectFileType(fileName: string, mimeType?: string): FileTypeInfo {
  const cleanName = (fileName || '').trim().toLowerCase();
  const extMatch = cleanName.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  // 1. Programação / Código Fonte / Textos Estruturados
  if (ext && LANGUAGE_MAP[ext]) {
    const lang = LANGUAGE_MAP[ext];
    return {
      id: lang.id,
      name: lang.name,
      category: 'code',
      icon: lang.icon,
      color: lang.color,
      extension: `.${ext}`,
    };
  }

  // 2. Imagens
  if (
    /^(image\/(png|jpe?g|gif|webp|bmp|avif|svg\+xml))$/i.test(mimeType || '') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext)
  ) {
    return {
      id: 'image',
      name: ext ? ext.toUpperCase() : 'Imagem',
      category: 'image',
      icon: 'image',
      color: '#10b981',
      extension: `.${ext || 'img'}`,
    };
  }

  // 3. PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return {
      id: 'pdf',
      name: 'PDF',
      category: 'pdf',
      icon: 'picture_as_pdf',
      color: '#ef4444',
      extension: '.pdf',
    };
  }

  // 4. Arquivos Compactados
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return {
      id: 'archive',
      name: ext.toUpperCase(),
      category: 'archive',
      icon: 'folder_zip',
      color: '#f59e0b',
      extension: `.${ext}`,
    };
  }

  // 5. Planilhas
  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    return {
      id: 'sheet',
      name: 'Planilha ' + ext.toUpperCase(),
      category: 'sheet',
      icon: 'table_chart',
      color: '#107c41',
      extension: `.${ext}`,
    };
  }

  // 6. Documentos de Texto / Word
  if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) {
    return {
      id: 'document',
      name: 'Documento ' + ext.toUpperCase(),
      category: 'document',
      icon: 'description',
      color: '#185abd',
      extension: `.${ext}`,
    };
  }

  // 7. Áudio
  if (/^audio\//i.test(mimeType || '') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return {
      id: 'audio',
      name: 'Áudio ' + (ext ? ext.toUpperCase() : ''),
      category: 'audio',
      icon: 'audiotrack',
      color: '#8b5cf6',
      extension: `.${ext}`,
    };
  }

  // 8. Vídeo
  if (/^video\//i.test(mimeType || '') || ['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext)) {
    return {
      id: 'video',
      name: 'Vídeo ' + (ext ? ext.toUpperCase() : ''),
      category: 'video',
      icon: 'movie',
      color: '#ec4899',
      extension: `.${ext}`,
    };
  }

  // Padrão genérico
  return {
    id: 'other',
    name: ext ? ext.toUpperCase() : 'Arquivo',
    category: 'other',
    icon: 'insert_drive_file',
    color: '#64748b',
    extension: ext ? `.${ext}` : '',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Syntax Highlighter rápido, seguro e sem dependências externas pesadas.
 * Gera marcações estruturadas para exibição em visualizador de código com números de linha.
 */
export function formatCodeWithHighlight(code: string, languageId: string): string {
  if (!code) return '';

  const lines = code.split('\n');
  const highlightedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const highlighted = highlightLine(rawLine, languageId);
    highlightedLines.push(
      `<div class="code-line"><span class="line-num">${i + 1}</span><span class="line-code">${highlighted || '&nbsp;'}</span></div>`
    );
  }

  return highlightedLines.join('');
}

function highlightLine(line: string, lang: string): string {
  if (!line.trim()) return '';

  // Escapa caracteres especiais HTML antes de aplicar os spans de estilo
  let escaped = escapeHtml(line);

  if (lang === 'json') {
    // 1. Chaves JSON ("key":)
    escaped = escaped.replace(/(&quot;.*?&quot;)(?=\s*:)/g, '<span class="tok-json-key">$1</span>');
    // 2. Strings de valores JSON ("value")
    escaped = escaped.replace(/(:\s*)(&quot;.*?&quot;)/g, '$1<span class="tok-string">$2</span>');
    escaped = escaped.replace(/(^\s*)(&quot;.*?&quot;)(?!\s*:)/g, '$1<span class="tok-string">$2</span>');
    // 3. Booleanos e nulos
    escaped = escaped.replace(/\b(true|false|null)\b/g, '<span class="tok-keyword">$1</span>');
    // 4. Números
    escaped = escaped.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="tok-number">$1</span>');
    return escaped;
  }

  // 1. Strings: "...", '...', `...` (com entidades HTML &quot; e &#039;)
  escaped = escaped.replace(/(&quot;.*?&quot;|&#039;.*?&#039;|`.*?`)/g, '<span class="tok-string">$1</span>');

  // 2. Comentários
  if (['javascript', 'typescript', 'csharp', 'java', 'cpp', 'c', 'go', 'rust', 'php', 'swift', 'dart', 'kotlin', 'scss', 'css'].includes(lang)) {
    escaped = escaped.replace(/(\/\/.*$)/, '<span class="tok-comment">$1</span>');
  } else if (['python', 'shell', 'powershell', 'ruby', 'yaml', 'r', 'config'].includes(lang)) {
    escaped = escaped.replace(/(#.*$)/, '<span class="tok-comment">$1</span>');
  } else if (['sql'].includes(lang)) {
    escaped = escaped.replace(/(--.*$)/, '<span class="tok-comment">$1</span>');
  } else if (['html', 'xml'].includes(lang)) {
    escaped = escaped.replace(/(&lt;!--.*?--&gt;)/g, '<span class="tok-comment">$1</span>');
  }

  // 3. Palavras-Chave (Keywords) por Linguagem
  let keywordsRegex: RegExp | null = null;

  if (['javascript', 'typescript'].includes(lang)) {
    keywordsRegex = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|class|extends|implements|interface|type|import|export|from|default|async|await|new|this|super|typeof|instanceof|void|yield|null|undefined|true|false)\b/g;
  } else if (['python'].includes(lang)) {
    keywordsRegex = /\b(def|class|return|if|elif|else|for|while|try|except|finally|raise|import|from|as|with|lambda|yield|global|nonlocal|pass|break|continue|in|is|not|and|or|True|False|None|self)\b/g;
  } else if (['csharp', 'java'].includes(lang)) {
    keywordsRegex = /\b(public|private|protected|internal|static|readonly|void|class|interface|struct|enum|record|namespace|using|package|import|return|if|else|for|foreach|while|switch|case|break|continue|try|catch|finally|throw|new|this|base|super|async|await|get|set|var|null|true|false)\b/g;
  } else if (['sql'].includes(lang)) {
    keywordsRegex = /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CREATE|TABLE|DROP|ALTER|ADD|INDEX|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|AND|OR|AS|UNION|ALL|DISTINCT|VALUES|SET|COUNT|SUM|AVG|MIN|MAX|COALESCE|EXISTS|BETWEEN|IN|LIKE|IS|CASE|WHEN|THEN|ELSE|END)\b/gi;
  } else if (['go', 'rust'].includes(lang)) {
    keywordsRegex = /\b(fn|func|package|import|type|struct|interface|impl|let|mut|pub|return|if|else|for|while|loop|match|switch|select|case|defer|go|break|continue|nil|true|false)\b/g;
  } else if (['html', 'xml'].includes(lang)) {
    escaped = escaped.replace(/(&lt;\/?)([a-zA-Z0-9:-]+)/g, '$1<span class="tok-tag">$2</span>');
    escaped = escaped.replace(/([a-zA-Z0-9:-]+)=/g, '<span class="tok-attr">$1</span>=');
  }

  if (keywordsRegex) {
    escaped = escaped.replace(keywordsRegex, '<span class="tok-keyword">$&</span>');
  }

  // 4. Números
  escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');

  // 5. Chamadas de Função
  escaped = escaped.replace(/\b([a-zA-Z0-9_$]+)(?=\s*\()/g, '<span class="tok-fn">$1</span>');

  return escaped;
}
