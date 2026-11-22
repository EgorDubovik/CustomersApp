import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '@/constants/Config';
import { LIST_PAGE_SIZE, parseLocalDateTime, toLocalDbString } from '@/components/scheduler/utils/weeks';

/**
 * Бесконечный List расписания — keyset-пагинация в обе стороны от даты.
 *
 * Курсор — (start, id) крайнего загруженного аппоинтмента; сервер отдаёт следующую
 * пачку и hasMore. При открытии сразу грузим по пачке в прошлое и в будущее.
 * Показываем только непрерывный кусок между крайними курсорами (без «дыр» от недель,
 * загруженных в Day/Week); со стороны, где hasMore = false, кусок не ограничен.
 */

type Direction = 'start' | 'end';
type Cursor = { start: string; id: number };
type Edge = { cursor: Cursor; hasMore: boolean };

interface PagedAppointment {
  id: number | string;
  start: string | Date;
  end: string | Date;
}

const dayStartCursor = (date: Date): Cursor => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return { start: toLocalDbString(d), id: 0 };
};

const toCursor = (a: PagedAppointment): Cursor => ({
  start: typeof a.start === 'string' ? a.start : toLocalDbString(a.start),
  id: Number(a.id),
});

const cursorTime = (c: Cursor) => parseLocalDateTime(c.start).getTime();

export function useListPaging<T extends PagedAppointment>({
  token,
  active,
  date,
  mergeAppointments,
  replaceRange,
}: {
  token: string | null | undefined;
  /** List сейчас на экране — только тогда грузим */
  active: boolean;
  /** Дата, вокруг которой строится список (Today, стрелки) */
  date: Date;
  mergeAppointments: (items: T[]) => void;
  /** Заменить все аппоинтменты с началом в [from, to] (null — без границы) на items */
  replaceRange: (from: Date | null, to: Date | null, items: T[]) => void;
}) {
  const [edges, setEdges] = useState<{ start: Edge; end: Edge }>(() => {
    const c = dayStartCursor(date);
    return { start: { cursor: c, hasMore: true }, end: { cursor: c, hasMore: true } };
  });
  const [paging, setPaging] = useState({ start: false, end: false });
  const [loadError, setLoadError] = useState(false);
  // Растёт при сбросе списка — ответы для прежнего куска выбрасываем
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const initializedRef = useRef(-1);

  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const pagingRef = useRef(paging);
  pagingRef.current = paging;

  const fetchPage = async (direction: Direction, cursor: Cursor): Promise<{ appointments: T[]; hasMore: boolean }> => {
    const [key, idKey] = direction === 'end' ? ['after', 'afterId'] : ['before', 'beforeId'];
    const params = `${key}=${encodeURIComponent(cursor.start)}&${idKey}=${cursor.id}&limit=${LIST_PAGE_SIZE}`;
    const response = await fetch(`${API_URL}/appointments?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
    const data = await response.json();
    return { appointments: data.appointments || [], hasMore: !!data.hasMore };
  };

  const loadMore = useCallback(
    async (direction: Direction) => {
      const edge = edgesRef.current[direction];
      if (!token || pagingRef.current[direction] || !edge.hasMore) return;
      const gen = generationRef.current;
      pagingRef.current = { ...pagingRef.current, [direction]: true };
      setPaging((p) => ({ ...p, [direction]: true }));
      try {
        const page = await fetchPage(direction, edge.cursor);
        if (gen !== generationRef.current) return;
        mergeAppointments(page.appointments);
        // Сервер отдаёт пачку в порядке удаления от курсора — последний и есть новый край
        const last = page.appointments[page.appointments.length - 1];
        setEdges((prev) => ({
          ...prev,
          [direction]: { cursor: last ? toCursor(last) : prev[direction].cursor, hasMore: page.hasMore },
        }));
        setLoadError(false);
      } catch (err) {
        console.error(err);
        if (gen === generationRef.current) setLoadError(true);
      } finally {
        if (gen === generationRef.current) {
          pagingRef.current = { ...pagingRef.current, [direction]: false };
          setPaging((p) => ({ ...p, [direction]: false }));
        }
      }
    },
    [token, mergeAppointments]
  );

  const reset = useCallback((around: Date) => {
    generationRef.current += 1;
    const c = dayStartCursor(around);
    const fresh = { start: { cursor: c, hasMore: true }, end: { cursor: c, hasMore: true } };
    edgesRef.current = fresh;
    pagingRef.current = { start: false, end: false };
    setEdges(fresh);
    setPaging({ start: false, end: false });
    setLoadError(false);
    setGeneration(generationRef.current);
  }, []);

  // Открыли List (или начали заново) — сразу по пачке в обе стороны
  useEffect(() => {
    if (!active || !token || initializedRef.current === generation) return;
    initializedRef.current = generation;
    loadMore('start');
    loadMore('end');
  }, [active, token, generation, loadMore]);

  // Дата ушла за пределы загруженного куска (стрелки) — строим список заново вокруг неё
  useEffect(() => {
    if (!active) return;
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const t = day.getTime();
    const { start, end } = edgesRef.current;
    if ((start.hasMore && t < cursorTime(start.cursor)) || (end.hasMore && t > cursorTime(end.cursor))) {
      reset(date);
    }
  }, [active, date, reset]);

  const isInitialLoading = initializedRef.current !== generation;
  const loading = useMemo(
    () => ({ start: isInitialLoading || paging.start, end: isInitialLoading || paging.end }),
    [isInitialLoading, paging]
  );
  const reached = useMemo(
    () => ({ start: !edges.start.hasMore, end: !edges.end.hasMore }),
    [edges]
  );

  const filterEvent = useCallback(
    (event: { start: string | Date }) => {
      const t = parseLocalDateTime(event.start).getTime();
      return (
        (!edges.start.hasMore || t >= cursorTime(edges.start.cursor)) &&
        (!edges.end.hasMore || t <= cursorTime(edges.end.cursor))
      );
    },
    [edges]
  );

  /** Pull-to-refresh: перечитать уже загруженный кусок, не сбрасывая позицию */
  const refresh = useCallback(async () => {
    if (!token) return;
    const { start, end } = edgesRef.current;
    const qs: string[] = [];
    if (start.hasMore) qs.push(`startDate=${encodeURIComponent(start.cursor.start)}`);
    if (end.hasMore) qs.push(`endDate=${encodeURIComponent(end.cursor.start)}`);
    if (qs.length === 0) {
      // Загружено всё — просто начинаем заново вокруг даты
      reset(date);
      return;
    }
    const gen = generationRef.current;
    const response = await fetch(`${API_URL}/appointments?${qs.join('&')}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Server returned status code ${response.status}`);
    const data = await response.json();
    if (gen !== generationRef.current) return;
    replaceRange(
      start.hasMore ? parseLocalDateTime(start.cursor.start) : null,
      end.hasMore ? parseLocalDateTime(end.cursor.start) : null,
      data.appointments || []
    );
    setLoadError(false);
  }, [token, date, reset, replaceRange]);

  const retry = useCallback(() => {
    setLoadError(false);
    if (edgesRef.current.start.hasMore) loadMore('start');
    if (edgesRef.current.end.hasMore) loadMore('end');
  }, [loadMore]);

  return { loading, reached, loadError, loadMore, filterEvent, refresh, retry };
}
