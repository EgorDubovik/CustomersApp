import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { NativeSyntheticEvent, Pressable, StyleProp, Text, TextInput, TextInputSelectionChangeEventData, TextStyle, View } from 'react-native';
import { getInitials } from '@/components/appointment/tabs/shared';
import { MentionUser, displayToMarkup, markupToDisplay, mentionRanges, splitDisplay } from '@/utils/mentions';

const MAX_SUGGESTIONS = 6;
/** How many characters after @ still count as typing a name rather than text. */
const MAX_QUERY_LENGTH = 30;

interface Palette {
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryMuted: string;
  card: string;
  cardBorder: string;
}

interface Props {
  /** Text with mention markup `@[Name](user:ID)` */
  value: string;
  onChange: (markup: string) => void;
  candidates: MentionUser[];
  placeholder?: string;
  palette: Palette;
  style?: StyleProp<TextStyle>;
  editable?: boolean;
}

/** What a parent can do with the field — e.g. the @ button next to it. */
export interface MentionInputHandle {
  focus: () => void;
  /** Puts "@" at the caret (with a space before it when needed) and opens the people list. */
  startMention: () => void;
}

interface Trigger {
  /** Where the @ is */
  start: number;
  query: string;
}

/** "@query" right before the caret that should be completed, if any. */
function detectTrigger(text: string, caret: number): Trigger | null {
  for (let i = caret - 1; i >= 0 && caret - i <= MAX_QUERY_LENGTH + 1; i--) {
    const ch = text[i];
    if (ch === '@') {
      const before = i === 0 ? ' ' : text[i - 1];
      return /\s/.test(before) ? { start: i, query: text.slice(i + 1, caret) } : null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/**
 * Comment input with @mentions — the app's counterpart of the web MentionTextarea.
 *
 * A plain TextInput whose text is given as children, so "@Name" is drawn in the
 * accent colour while editing stays native. Typing @ opens the people list above
 * the field (the keyboard is below it); a tap inserts the name. Outward it speaks
 * the same `@[Name](user:ID)` markup the backend reads; deleting into a mention
 * removes it whole, deleting a letter elsewhere in it turns it into plain text.
 */
export default forwardRef<MentionInputHandle, Props>(function MentionInput({ value, onChange, candidates, placeholder, palette: c, style, editable = true }, ref) {
  const inputRef = useRef<TextInput>(null);
  const { display, mentions } = useMemo(() => markupToDisplay(value), [value]);
  // Empty field → no children at all, otherwise the placeholder may not show
  const segments = useMemo(() => (display ? splitDisplay(display, mentions) : []), [display, mentions]);
  const selectionRef = useRef({ start: display.length, end: display.length });
  // The text as last typed — selection events may arrive before it reaches props
  const latestDisplayRef = useRef(display);
  latestDisplayRef.current = display;
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  // After inserting a name the caret has to land after it; controlled only for that one update
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>(undefined);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    return candidates
      .map((user) => {
        const name = user.name.toLowerCase();
        const rank = name.startsWith(q) ? 0 : name.split(/\s+/).some((p) => p.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1;
        return { user, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.user.name.localeCompare(b.user.name))
      .slice(0, MAX_SUGGESTIONS)
      .map((x) => x.user);
  }, [trigger, candidates]);

  const handleChangeText = (next: string) => {
    const prev = display;
    const sel = selectionRef.current;

    // One character deleted right after a mention → remove the whole mention
    if (next.length === prev.length - 1 && sel.start === sel.end && sel.start > 0 && next === prev.slice(0, sel.start - 1) + prev.slice(sel.start)) {
      const range = mentionRanges(prev, mentions).find((r) => r.end === sel.start);
      if (range) {
        const without = prev.slice(0, range.start) + prev.slice(range.end);
        setForcedSelection({ start: range.start, end: range.start });
        setTrigger(null);
        latestDisplayRef.current = without;
        onChange(displayToMarkup(without, mentions));
        return;
      }
    }

    latestDisplayRef.current = next;
    // Typing moves the caret by the length difference; detect @ right away (iOS sends selection first)
    if (sel.start === sel.end) {
      const caret = Math.max(0, sel.start + (next.length - prev.length));
      setTrigger(detectTrigger(next, caret));
    }
    onChange(displayToMarkup(next, mentions));
  };

  const handleSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start, end } = e.nativeEvent.selection;
    selectionRef.current = { start, end };
    if (forcedSelection) setForcedSelection(undefined);
    setTrigger(start === end ? detectTrigger(latestDisplayRef.current, start) : null);
  };

  const select = (user: MentionUser) => {
    if (!trigger) return;
    const caret = selectionRef.current.start;
    const insert = `@${user.name} `;
    const nextDisplay = display.slice(0, trigger.start) + insert + display.slice(Math.max(caret, trigger.start + 1 + trigger.query.length));
    const known = mentions.some((m) => m.id === user.id) ? mentions : [...mentions, user];
    const at = trigger.start + insert.length;
    setTrigger(null);
    setForcedSelection({ start: at, end: at });
    selectionRef.current = { start: at, end: at };
    onChange(displayToMarkup(nextDisplay, known));
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    startMention: () => {
      const current = latestDisplayRef.current;
      const caret = Math.min(selectionRef.current.start, current.length);
      const needsSpace = caret > 0 && !/\s/.test(current[caret - 1]);
      const insert = needsSpace ? ' @' : '@';
      const next = current.slice(0, caret) + insert + current.slice(caret);
      const at = caret + insert.length;
      latestDisplayRef.current = next;
      selectionRef.current = { start: at, end: at };
      setForcedSelection({ start: at, end: at });
      setTrigger({ start: at - 1, query: '' });
      onChange(displayToMarkup(next, mentions));
      inputRef.current?.focus();
    },
  }));

  return (
    <View style={{ flex: 1 }}>
      {suggestions.length > 0 && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            marginBottom: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.cardBorder,
            backgroundColor: c.card,
            paddingVertical: 4,
            zIndex: 10,
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
          }}
        >
          {suggestions.map((user, index) => (
            <Pressable
              key={user.id}
              onPress={() => select(user)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 12,
                height: 40,
                backgroundColor: pressed || index === 0 ? c.primaryMuted : 'transparent',
              })}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: user.color || c.primary }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{getInitials(user.name)}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: index === 0 ? c.primary : c.text }} numberOfLines={1}>
                {user.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        ref={inputRef}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
        selection={forcedSelection}
        onBlur={() => setTrigger(null)}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        multiline
        editable={editable}
        style={style}
      >
        {segments.map((segment, i) =>
          segment.kind === 'mention' ? (
            <Text key={i} style={{ color: c.primary, fontWeight: '700' }}>
              {segment.text}
            </Text>
          ) : (
            <Text key={i}>{segment.text}</Text>
          ),
        )}
      </TextInput>
    </View>
  );
});
