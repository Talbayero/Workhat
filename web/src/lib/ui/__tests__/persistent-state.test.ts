import {
  readStoredBoolean,
  readStoredNumber,
  readStoredString,
  writeStoredBoolean,
  writeStoredNumber,
  writeStoredString,
} from "@/lib/ui/persistent-state";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("persistent UI state helpers", () => {
  it("persists collapsed state as a boolean", () => {
    const storage = createMemoryStorage();

    expect(readStoredBoolean(storage, "collapsed", false)).toBe(false);
    writeStoredBoolean(storage, "collapsed", true);
    expect(readStoredBoolean(storage, "collapsed", false)).toBe(true);
  });

  it("clamps persisted panel widths", () => {
    const storage = createMemoryStorage();

    writeStoredNumber(storage, "width", 999);
    expect(readStoredNumber(storage, "width", { fallback: 320, min: 260, max: 420 })).toBe(420);

    writeStoredNumber(storage, "width", 240);
    expect(readStoredNumber(storage, "width", { fallback: 320, min: 260, max: 420 })).toBe(260);
  });

  it("persists allowed string values only", () => {
    const storage = createMemoryStorage();

    writeStoredString(storage, "preset", "wide");
    expect(readStoredString(storage, "preset", ["compact", "comfortable", "wide"] as const, "comfortable"))
      .toBe("wide");

    writeStoredString(storage, "preset", "surprising");
    expect(readStoredString(storage, "preset", ["compact", "comfortable", "wide"] as const, "comfortable"))
      .toBe("comfortable");
  });
});
