const EVENT_COLORS = new Set(['indigo', 'blue', 'teal', 'emerald', 'amber', 'orange', 'rose', 'purple', 'pink', 'slate']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const AUTO_ARCHIVE_DELAYS = new Set(['never', 'immediate', '1h', '6h', '12h', '24h', '48h', '72h', '7d']);

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isOptionalString(value, maxLength) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function validateEventInput(body, partial = false) {
  const required = key => !partial || body[key] !== undefined;
  if (required('title') && !isNonEmptyString(body.title, 160)) return 'Título inválido (máximo de 160 caracteres)';
  if (!isOptionalString(body.description, 5000)) return 'Descrição inválida (máximo de 5000 caracteres)';
  if (required('date') && !isIsoDate(body.date)) return 'Data inicial inválida';
  if (body.endDate !== undefined && !isIsoDate(body.endDate)) return 'Data final inválida';
  if (body.date && body.endDate && body.endDate < body.date) return 'A data final não pode ser anterior à inicial';
  if (required('startTime') && !isTime(body.startTime)) return 'Horário inicial inválido';
  if (required('endTime') && !isTime(body.endTime)) return 'Horário final inválido';
  if (!body.allDay && body.date && (body.endDate || body.date) === body.date && body.startTime && body.endTime && body.endTime <= body.startTime) return 'O horário final deve ser posterior ao inicial';
  if (body.color !== undefined && !EVENT_COLORS.has(body.color)) return 'Cor de evento inválida';
  if (!isOptionalString(body.category, 60)) return 'Categoria inválida';
  if (body.allDay !== undefined && typeof body.allDay !== 'boolean') return 'Indicador de dia inteiro inválido';
  if (body.dayTimes !== undefined) {
    if (!body.dayTimes || typeof body.dayTimes !== 'object' || Array.isArray(body.dayTimes)) return 'Horários por dia inválidos';
    for (const [date, times] of Object.entries(body.dayTimes)) {
      if (!isIsoDate(date) || !times || !isTime(times.startTime) || !isTime(times.endTime) || times.endTime <= times.startTime) return 'Horários por dia inválidos';
    }
  }
  return null;
}

function validateTaskInput(body, partial = false) {
  const required = key => !partial || body[key] !== undefined;
  if (required('title') && !isNonEmptyString(body.title, 160)) return 'Título inválido (máximo de 160 caracteres)';
  if (!isOptionalString(body.description, 5000)) return 'Descrição inválida (máximo de 5000 caracteres)';
  if (body.color !== undefined && body.color !== null && body.color !== '' && !isHexColor(body.color)) return 'Cor inválida';
  if (body.priority !== undefined && !TASK_PRIORITIES.has(body.priority)) return 'Prioridade inválida';
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '' && !isIsoDate(body.dueDate)) return 'Prazo inválido';
  if (body.archived !== undefined && typeof body.archived !== 'boolean') return 'Estado de arquivamento inválido';
  if (body.labels !== undefined && (!Array.isArray(body.labels) || body.labels.length > 8 || body.labels.some(label => typeof label !== 'string' || label.length > 50))) return 'Etiquetas inválidas';
  if (body.assigneeIds !== undefined && (!Array.isArray(body.assigneeIds) || body.assigneeIds.length > 100 || body.assigneeIds.some(id => typeof id !== 'string' || !id))) return 'Responsáveis inválidos';
  if (body.checklist !== undefined && (!Array.isArray(body.checklist) || body.checklist.length > 200 || body.checklist.some(item => !item || typeof item.id !== 'string' || !isNonEmptyString(item.text, 300) || typeof item.done !== 'boolean' || !isOptionalString(item.groupTitle, 100)))) return 'Checklist inválido';
  return null;
}

module.exports = {
  EVENT_COLORS,
  TASK_PRIORITIES,
  AUTO_ARCHIVE_DELAYS,
  isNonEmptyString,
  isOptionalString,
  isIsoDate,
  isTime,
  isHexColor,
  validateEventInput,
  validateTaskInput,
};
