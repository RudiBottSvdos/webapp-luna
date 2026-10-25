import { describe, expect, it } from "vitest";
import { Endpointer, NoiseFloor } from "./endpointer";

const feedAll = (e: Endpointer, levels: number[]) => levels.map((l) => e.feed(l));

describe("Endpointer", () => {
  it("endet nach 1,2 s Stille, nachdem gesprochen wurde", () => {
    const e = new Endpointer(0.005);
    const speech = Array(10).fill(0.1);
    const silence = Array(15).fill(0.001);
    const r = feedAll(e, [...speech, ...silence]);
    expect(r.slice(0, 24).every((x) => x === "continue")).toBe(true);
    expect(r[24]).toBe("end");
  });

  it("meldet no-speech, wenn nach dem Weckwort nichts kommt", () => {
    const e = new Endpointer(0.005);
    const r = feedAll(e, Array(75).fill(0.001));
    expect(r[73]).toBe("continue");
    expect(r[74]).toBe("no-speech");
  });

  it("kurze Pausen beenden nicht", () => {
    const e = new Endpointer(0.005);
    const r = feedAll(e, [...Array(5).fill(0.1), ...Array(10).fill(0.001), ...Array(5).fill(0.1)]);
    expect(r.every((x) => x === "continue")).toBe(true);
  });

  it("hat eine harte Obergrenze", () => {
    const e = new Endpointer(0.005, { maxMs: 800 });
    const r = feedAll(e, Array(10).fill(0.1));
    expect(r[9]).toBe("end");
  });

  it("Schwelle richtet sich nach dem Grundrauschen", () => {
    expect(new Endpointer(0.001).threshold).toBe(0.015);
    expect(new Endpointer(0.02).threshold).toBeCloseTo(0.06);
  });
});

describe("NoiseFloor", () => {
  it("folgt leisen Pegeln, ignoriert kurze laute weitgehend", () => {
    const f = new NoiseFloor();
    for (let i = 0; i < 200; i++) f.update(0.01);
    for (let i = 0; i < 20; i++) f.update(0.3);
    expect(f.current).toBeLessThan(0.03);
  });
});
