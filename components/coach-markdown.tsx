import { useMemo } from 'react';
import Markdown from 'react-native-markdown-display';
import { Palette, useTheme } from '@/constants/sprintlab';

// SprintLab Coach: renders a Split chat message's Markdown (headings, bold, paragraphs, bullet/
// numbered lists, links) instead of showing raw syntax like "###" or "**bold**". Only used for
// Split's own text — athlete messages, proposal-card copy, and error bubbles stay plain <Text>,
// unchanged from before. Styles are tuned to sit inside the existing message bubble (see
// components/coach-overlay.tsx's styles.messageSplit/messageSplitText) — same body size/line
// height/color as before, headings kept conversation-sized rather than article-sized, and list/
// paragraph spacing kept tight so a normal short reply still reads as one compact bubble.
export function CoachMarkdown({ children }: { children: string }) {
  const palette = useTheme();
  const styles = useMemo(() => createMarkdownStyles(palette), [palette]);
  return <Markdown style={styles}>{children}</Markdown>;
}

const createMarkdownStyles = (palette: Palette) => {
  const heading = { color: palette.text, fontWeight: '800' as const, marginTop: 6, marginBottom: 3 };
  return {
    body: { color: palette.text, fontSize: 13, lineHeight: 18 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    heading1: { ...heading, fontSize: 16 },
    heading2: { ...heading, fontSize: 15 },
    heading3: { ...heading, fontSize: 14 },
    heading4: { ...heading, fontSize: 13.5 },
    heading5: { ...heading, fontSize: 13 },
    heading6: { ...heading, fontSize: 13 },
    strong: { fontWeight: '800' as const, color: palette.text },
    em: { fontStyle: 'italic' as const },
    s: { textDecorationLine: 'line-through' as const },
    bullet_list: { marginTop: 2, marginBottom: 4 },
    ordered_list: { marginTop: 2, marginBottom: 4 },
    list_item: { marginBottom: 4, flexDirection: 'row' as const },
    bullet_list_icon: { color: palette.accent, fontSize: 13, lineHeight: 18, marginRight: 7 },
    bullet_list_content: { flex: 1 },
    ordered_list_icon: { color: palette.accent, fontSize: 13, lineHeight: 18, fontWeight: '800' as const, marginRight: 7 },
    ordered_list_content: { flex: 1 },
    link: { color: palette.accent, textDecorationLine: 'underline' as const },
    blocklink: { color: palette.accent },
    hr: { backgroundColor: palette.border, height: 1, marginVertical: 8 },
    blockquote: { backgroundColor: palette.surface, borderLeftWidth: 3, borderLeftColor: palette.accent, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 4, borderRadius: 4 },
    code_inline: { backgroundColor: palette.surface, color: palette.text, fontFamily: 'monospace' as const, fontSize: 12, paddingHorizontal: 4, borderRadius: 4 },
    code_block: { backgroundColor: palette.surface, color: palette.text, fontFamily: 'monospace' as const, fontSize: 12, padding: 8, borderRadius: 8 },
    fence: { backgroundColor: palette.surface, color: palette.text, fontFamily: 'monospace' as const, fontSize: 12, padding: 8, borderRadius: 8 },
  };
};
