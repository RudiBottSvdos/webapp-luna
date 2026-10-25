import * as ort from "onnxruntime-web/wasm";
import type { WakeModels } from "./pipeline";

/** Lädt die drei openWakeWord-Modelle (ONNX) und verpackt sie für die Pipeline. */
export async function loadWakeModels(urls: { mel: string; embed: string; wake: string }): Promise<WakeModels> {
  // Die WASM-Laufzeit bündelt Vite als Asset. Ein Thread genügt und braucht keine Cross-Origin-Isolation.
  ort.env.wasm.numThreads = 1;
  const opts: ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"] };
  const [mel, embed, wake] = await Promise.all([
    ort.InferenceSession.create(urls.mel, opts),
    ort.InferenceSession.create(urls.embed, opts),
    ort.InferenceSession.create(urls.wake, opts),
  ]);
  const run = async (s: ort.InferenceSession, data: Float32Array, dims: number[]) => {
    const out = await s.run({ [s.inputNames[0]!]: new ort.Tensor("float32", data, dims) });
    return out[s.outputNames[0]!]!.data as Float32Array;
  };
  return {
    mel: (samples) => run(mel, samples, [1, samples.length]),
    embed: (window) => run(embed, window, [1, 76, 32, 1]),
    classify: async (features) => (await run(wake, features, [1, 16, 96]))[0]!,
  };
}
