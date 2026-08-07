import { describe, expect, it } from "vitest";

import { NotFoundError } from "./app-error";
import {
  fail,
  flatMapResult,
  isErr,
  isOk,
  mapResult,
  type Result,
  succeed,
  unwrapOr,
} from "./result";

describe("Result", () => {
  it("carries a value on success and an error on failure", () => {
    expect(succeed(3)).toEqual({ ok: true, value: 3 });

    const error = new NotFoundError();
    expect(fail(error)).toEqual({ ok: false, error });
  });

  it("has a success shape for an operation that returns nothing", () => {
    expect(succeed()).toEqual({ ok: true, value: undefined });
  });

  it("narrows through isOk and isErr", () => {
    const result: Result<number> = succeed(3);

    if (isOk(result)) {
      expect(result.value).toBe(3);
    } else {
      expect.unreachable("a success must narrow to the ok branch");
    }

    expect(isErr(fail(new NotFoundError()))).toBe(true);
  });

  it("maps a success and leaves a failure untouched", () => {
    const error = new NotFoundError();

    expect(mapResult(succeed(3), (value) => value * 2)).toEqual({ ok: true, value: 6 });
    expect(mapResult(fail(error) as Result<number>, (value) => value * 2)).toEqual({
      ok: false,
      error,
    });
  });

  it("chains a second fallible step, and the first failure wins", () => {
    const error = new NotFoundError();
    const double = (value: number): Result<number> => succeed(value * 2);

    expect(flatMapResult(succeed(3), double)).toEqual({ ok: true, value: 6 });
    expect(flatMapResult(fail(error) as Result<number>, double)).toEqual({ ok: false, error });
  });

  it("does not call the transform of a failed result", () => {
    let calls = 0;

    mapResult(fail(new NotFoundError()) as Result<number>, (value) => {
      calls += 1;
      return value;
    });

    expect(calls).toBe(0);
  });

  it("falls back on a failure", () => {
    expect(unwrapOr(succeed(3), 0)).toBe(3);
    expect(unwrapOr(fail(new NotFoundError()) as Result<number>, 0)).toBe(0);
  });
});
