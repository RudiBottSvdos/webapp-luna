/**
 * WAV-Header (16-Bit-PCM, mono) für einen Strom unbekannter Länge. Die Längenfelder stehen
 * auf dem Maximum; der Streaming-Player im Frontend ignoriert sie ohnehin.
 */
export function wavStreamHeader(sampleRate: number): Buffer {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(0xffffffff, 4);
  b.write('WAVEfmt ', 8, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(0xffffffff - 36, 40);
  return b;
}
