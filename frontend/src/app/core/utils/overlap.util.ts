import { CalendarEvent } from '../models/event.model';

export interface PositionedEvent extends CalendarEvent {
  top: number;
  height: number;
  left: number;        // Porcentagem (0 - 100)
  width: number;       // Porcentagem (0 - 100)
  column: number;      // Índice da coluna dentro do grupo
  totalColumns: number;// Total de colunas simultâneas no grupo
}

interface EventGroup {
  events: CalendarEvent[];
  columns: CalendarEvent[][];
}

/** Converte horário 'HH:MM' para minutos desde a meia-noite */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Converte minutos desde a meia-noite para 'HH:MM' */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}`;
}

/** Verifica se dois eventos se sobrepõem no horário */
export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = Math.max(aStart + 15, timeToMinutes(a.endTime));
  const bStart = timeToMinutes(b.startTime);
  const bEnd = Math.max(bStart + 15, timeToMinutes(b.endTime));

  return aStart < bEnd && aEnd > bStart;
}

/** Agrupa eventos sobrepostos */
function buildGroups(events: CalendarEvent[]): EventGroup[] {
  const sorted = [...events].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const groups: EventGroup[] = [];

  for (const event of sorted) {
    let placed = false;
    for (const group of groups) {
      if (group.events.some(e => eventsOverlap(e, event))) {
        group.events.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push({ events: [event], columns: [] });
    }
  }

  return groups;
}

/** Distribui eventos em colunas paralelas sem colisão dentro do grupo */
function assignColumns(group: EventGroup): void {
  const sorted = [...group.events].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  group.columns = [];

  for (const event of sorted) {
    let placed = false;
    for (const col of group.columns) {
      const lastInCol = col[col.length - 1];
      if (!eventsOverlap(lastInCol, event)) {
        col.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      group.columns.push([event]);
    }
  }
}

/** Retorna o número máximo de colunas simultâneas durante o período do evento */
function getMaxConcurrentCols(event: CalendarEvent, group: EventGroup): number {
  const concurrent = group.events.filter(e => eventsOverlap(e, event));
  const usedCols = new Set<number>();
  for (let ci = 0; ci < group.columns.length; ci++) {
    for (const e of group.columns[ci]) {
      if (concurrent.includes(e)) {
        usedCols.add(ci);
      }
    }
  }
  return Math.max(usedCols.size, 1);
}

/**
 * Calcula o posicionamento de sobreposição estilo Google Calendar para os eventos de um dia
 */
export function resolveDayOverlaps(
  events: CalendarEvent[],
  hourHeight = 60
): PositionedEvent[] {
  if (!events || events.length === 0) return [];

  const timedEvents = events.filter(e => !e.allDay);
  if (timedEvents.length === 0) return [];

  const groups = buildGroups(timedEvents);
  groups.forEach(assignColumns);

  const positioned: PositionedEvent[] = [];

  for (const group of groups) {
    const numColumns = group.columns.length;

    for (let colIndex = 0; colIndex < numColumns; colIndex++) {
      for (const event of group.columns[colIndex]) {
        const maxConcurrent = getMaxConcurrentCols(event, group);
        const totalCols = Math.max(numColumns, maxConcurrent);

        const startMins = timeToMinutes(event.startTime);
        const endMins = Math.max(startMins + 15, timeToMinutes(event.endTime));
        const durationMins = endMins - startMins;

        const top = (startMins / 60) * hourHeight;
        const height = Math.max((durationMins / 60) * hourHeight, 26);

        const widthPercent = 100 / totalCols;
        const leftPercent = (colIndex / totalCols) * 100;

        positioned.push({
          ...event,
          top,
          height,
          left: leftPercent,
          width: widthPercent,
          column: colIndex,
          totalColumns: totalCols,
        });
      }
    }
  }

  return positioned;
}
