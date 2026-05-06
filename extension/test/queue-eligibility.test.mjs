import assert from "node:assert/strict";
import {
  getQueueEntryRejectionReason,
  isQueueEntryAutoApplySupported,
} from "/tmp/merlin-extension-tests/background/queue-eligibility.js";

assert.equal(
  getQueueEntryRejectionReason({
    source: "gupy",
    job_url:
      "https://vaga-ja.com/vagas/fitness-brasil-ltda/analista-de-marketing-digital-hibrido?jobBoardSource=gupy_portal",
  }),
  "unsupported_apply_method",
);

assert.equal(
  isQueueEntryAutoApplySupported({
    source: "gupy",
    job_url: "https://empresa.gupy.io/jobs/123?jobBoardSource=gupy_portal",
  }),
  true,
);

assert.equal(
  isQueueEntryAutoApplySupported({
    source: "catho",
    job_url: "https://www.catho.com.br/vagas/supervisor-de-marketing/36403512",
  }),
  true,
);
