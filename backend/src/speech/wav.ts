/**
 * Pocket TTS streamt WAV und schreibt deshalb Platzhalter-Längen in den Header.
 * Browser halten die Datei dann für stundenlang, und "ended" kommt nicht zuverlässig.
 * Setzt RIFF- und data-Länge auf die tatsächliche Größe. Nicht-WAV bleibt unverändert.
 */
export function fixWavSizes(buf: Buffer): Buffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return buf;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    if (id === 'data') {
      buf.writeUInt32LE(buf.length - off - 8, off + 4);
      buf.writeUInt32LE(buf.length - 8, 4);
      return buf;
    }
    const size = buf.readUInt32LE(off + 4);
    off += 8 + size + (size % 2);
  }
  return buf;
}
