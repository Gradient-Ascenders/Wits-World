declare module 'emojilib/emojis.json' {
  const emojis: Record<string, { char: string; keywords: string[] }>;
  export default emojis;
}
