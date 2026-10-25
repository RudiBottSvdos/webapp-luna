/** Namen, die die Sprachausgabe sonst buchstabieren würde, in Sprechform bringen (rein). */
export function speakNames(text: string): string {
  return text.replace(/F\.R\.I\.D\.A\.Y\.?/g, 'Friday');
}
