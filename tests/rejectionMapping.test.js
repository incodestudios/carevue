import test from "node:test";
import assert from "node:assert/strict";
import { mapHhaxErrors } from "../services/adjudicationService.js";

test("maps HHAX errors into normalized structure", () => {
  const payload = {
    status: "REJECTED",
    errors: [
      {
        code: "E123",
        message: "Invalid service code",
        fieldPath: "serviceCode",
        severity: "ERROR",
      },
    ],
  };

  const mapped = mapHhaxErrors(payload);

  assert.equal(mapped.length, 1);
  assert.deepEqual(mapped[0], {
    code: "E123",
    message: "Invalid service code",
    fieldPath: "serviceCode",
    severity: "ERROR",
  });
});
