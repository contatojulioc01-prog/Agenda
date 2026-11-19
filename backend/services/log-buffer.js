const MAX_ENTRIES = 200;

function formatLocalTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function serializeArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

class LogBuffer {
  constructor(maxEntries = MAX_ENTRIES) {
    this.maxEntries = maxEntries;
    this.entries = [];
    this.sequence = 0;
    this.installed = false;
  }

  push(level, message) {
    this.entries.push({
      id: ++this.sequence,
      level,
      message: String(message || '').slice(0, 2000),
      timestamp: formatLocalTimestamp(),
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  installConsoleCapture() {
    if (this.installed) return;
    this.installed = true;

    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);

    console.error = (...args) => {
      this.push('error', args.map(serializeArg).join(' '));
      origError(...args);
    };

    console.warn = (...args) => {
      this.push('warn', args.map(serializeArg).join(' '));
      origWarn(...args);
    };
  }

  list({ level = 'all', limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), this.maxEntries);
    const filtered = level && level !== 'all'
      ? this.entries.filter(e => e.level === level)
      : this.entries;
    return filtered.slice(-safeLimit).reverse();
  }

  clear() {
    this.entries = [];
  }
}

module.exports = { LogBuffer, formatLocalTimestamp };
