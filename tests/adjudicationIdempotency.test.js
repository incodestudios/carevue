import test from "node:test";
import assert from "node:assert/strict";
import { ensureIdempotentSubmission } from "../services/adjudicationService.js";

function createInMemoryStore() {
  const records = [];
  return {
    records,
    async findOne(query) {
      return (
        records.find(
          (record) =>
            record.visitId === query.visitId &&
            record.adjudicator === query.adjudicator &&
            record.payloadHash === query.payloadHash
        ) || null
      );
    },
    async create(doc) {
      const record = { ...doc, _id: String(records.length + 1) };
      records.push(record);
      return {
        ...record,
        toObject() {
          return record;
        },
      };
    },
  };
}

test("ensures idempotent submission by payload hash", async () => {
  const store = createInMemoryStore();
  const payload = { visitId: "v1", data: { foo: "bar" } };

  const first = await ensureIdempotentSubmission({
    store,
    agencyId: "a1",
    visitId: "v1",
    adjudicator: "HHAX",
    payloadVersion: "v1",
    requestPayload: payload,
  });

  const second = await ensureIdempotentSubmission({
    store,
    agencyId: "a1",
    visitId: "v1",
    adjudicator: "HHAX",
    payloadVersion: "v1",
    requestPayload: payload,
  });

  assert.equal(store.records.length, 1);
  assert.equal(first.payloadHash, second.payloadHash);
});
