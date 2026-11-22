import { afterEach, describe, expect, it, vi } from "vitest";
import {readFileSync} from 'node:fs';
const platform=vi.hoisted(()=>({OS:'web'}));
vi.mock("react-native", () => ({ Platform: platform }));
import { api, baseUrl } from "../src/api";
afterEach(() => {platform.OS='web';vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("app API client", () => {
  it.each([
    ['',undefined,'https://movecompass.onrender.com'],
    ['','https://care.example/','https://care.example'],
    ['https://override.example/','https://care.example','https://override.example'],
  ])('resolves native backend with setting=%s and environment=%s',(setting,environment,expected)=>{
    platform.OS='android';vi.stubEnv('EXPO_PUBLIC_API_URL',environment);
    expect(baseUrl(setting!)).toBe(expected);
  });
  it('uses Render in the preview phone build profile',()=>{
    const config=JSON.parse(readFileSync(new URL('../eas.json',import.meta.url),'utf8'));
    expect(config.build.preview.env.EXPO_PUBLIC_API_URL).toBe('https://movecompass.onrender.com');
  });
  it("uses the web origin instead of a settings override", () => {
    vi.stubGlobal("window", { location: { origin: "https://care.example" } });
    expect(baseUrl("https://other.example")).toBe("https://care.example");
  });
  it("sends authenticated JSON and returns successful data", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ event: { id: "1" } }),
      });
    vi.stubGlobal("fetch", fetch);
    expect(
      await api("https://care.example", "/api/completions", "jwt", { reps: 6 }),
    ).toEqual({ event: { id: "1" } });
    expect(fetch).toHaveBeenCalledWith(
      "https://care.example/api/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
          Authorization: "Bearer jwt",
        },
        body: '{"reps":6}',
      }),
    );
  });
  it("returns empty lists without inventing patient data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }),
    );
    expect(await api("https://care.example", "/api/events", "jwt")).toEqual({
      events: [],
    });
  });
  it("surfaces validation and connection failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({ errors: ["reps invalid", "source required"] }),
        }),
    );
    await expect(
      api("https://care.example", "/api/completions", "jwt", {}),
    ).rejects.toThrow("reps invalid. source required");
    await expect(api("", "/api/me")).rejects.toThrow("Set your backend URL");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(api("https://care.example", "/api/me")).rejects.toThrow(
      "Can't reach MoveCompass",
    );
  });
});
