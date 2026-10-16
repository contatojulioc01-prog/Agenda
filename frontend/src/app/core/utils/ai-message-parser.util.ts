export interface AiOptionPrompt {
  question?: string;
  multiSelect: boolean;
  options: string[];
}

export interface ParsedAiContent {
  text: string;
  optionsPrompt: AiOptionPrompt | null;
}

/**
 * Limpa blocos de ações de interface indesejados (como menus contextuais,
 * botões de interface ou disclaimers burocráticos de "Ações e Informações Disponíveis").
 */
export function cleanProhibitedAiBoilerplate(content: string): string {
  if (!content) return '';
  return content
    // 1. Bloco de Ações e Informações Disponíveis completo (inclusive entre aspas, títulos markdown ou traços)
    .replace(/(?:["'“”])?\s*(?:---\s*)?(?:#{1,4}\s*)?Ações(?:\s+e\s+Informações)?\s+Disponíveis[\s\S]*?(?:🗑️\s*Excluir\.?|modificações desejadas\.?|da\s+plataforma\.?|desejadas\.?)(?:["'“”])?/gi, '')
    // 2. Parágrafos introduzindo menu contextual de interface
    .replace(/Para gerenciar este compromisso ou o card associado diretamente[\s\S]*?(?:🗑️\s*Excluir\.?|modificações desejadas\.?|$)(?:["'“”])?/gi, '')
    // 3. Lista de botões de interface solta
    .replace(/👁️\s*Visualizar\s*—\s*abre a modal[\s\S]*?(?:🗑️\s*Excluir\.?|$)(?:["'“”])?/gi, '')
    // 4. Parágrafo final de orientações de tela
    .replace(/Caso precise realizar alguma alteração no evento[\s\S]*?(?:modificações desejadas\.?|$)(?:["'“”])?/gi, '')
    .trim();
}

/**
 * Extracts and parses any interactive options block formatted as:
 * ```options
 * {
 *   "question": "De quais times você gostaria de visualizar as tarefas?",
 *   "multiSelect": true,
 *   "options": ["Equipe Comercial", "Equipe TI", "Todos os times"]
 * }
 * ```
 */
export function parseAiMessageContent(rawContent: string): ParsedAiContent {
  if (!rawContent) {
    return { text: '', optionsPrompt: null };
  }

  const cleanedRaw = cleanProhibitedAiBoilerplate(rawContent);

  const optionsRegex = /```(?:options|json:options|interactive-options|choices)\s*([\s\S]*?)```/i;
  const match = cleanedRaw.match(optionsRegex);

  if (!match) {
    return { text: cleanedRaw, optionsPrompt: null };
  }

  const rawJson = match[1]?.trim() || '';
  const cleanText = cleanProhibitedAiBoilerplate(cleanedRaw.replace(optionsRegex, '').trim());

  let parsedObject: any = null;
  try {
    parsedObject = JSON.parse(rawJson);
  } catch {
    // If JSON is slightly malformed or has relaxed syntax, attempt cleanup
    try {
      const sanitized = rawJson
        .replace(/,\s*([\]}])/g, '$1') // remove trailing commas
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2": '); // ensure keys are quoted
      parsedObject = JSON.parse(sanitized);
    } catch {
      parsedObject = null;
    }
  }

  if (!parsedObject || typeof parsedObject !== 'object') {
    return { text: cleanText || rawContent, optionsPrompt: null };
  }

  const rawOptions = Array.isArray(parsedObject.options)
    ? parsedObject.options
    : Array.isArray(parsedObject.choices)
    ? parsedObject.choices
    : Array.isArray(parsedObject.items)
    ? parsedObject.items
    : [];

  const options: string[] = [];
  for (const item of rawOptions) {
    if (typeof item === 'string' && item.trim()) {
      options.push(item.trim());
    } else if (item && typeof item === 'object') {
      const label = String(item.label || item.name || item.title || item.text || item.value || '').trim();
      if (label) options.push(label);
    }
  }

  if (options.length === 0) {
    return { text: cleanText || rawContent, optionsPrompt: null };
  }

  // Deduplicate preserving order
  const uniqueOptions = Array.from(new Set(options));

  const multiSelect = parsedObject.multiSelect !== undefined
    ? Boolean(parsedObject.multiSelect)
    : parsedObject.multi_select !== undefined
    ? Boolean(parsedObject.multi_select)
    : parsedObject.multiple !== undefined
    ? Boolean(parsedObject.multiple)
    : true; // default to true for maximum flexibility

  const question = typeof parsedObject.question === 'string' && parsedObject.question.trim()
    ? parsedObject.question.trim()
    : typeof parsedObject.title === 'string' && parsedObject.title.trim()
    ? parsedObject.title.trim()
    : undefined;

  return {
    text: cleanText,
    optionsPrompt: {
      question,
      multiSelect,
      options: uniqueOptions,
    },
  };
}

