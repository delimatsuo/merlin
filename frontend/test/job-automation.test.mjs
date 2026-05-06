import assert from "node:assert/strict";
import {
  getAutoApplyRejectionReason,
  isAutoApplySupported,
} from "/tmp/merlin-frontend-tests/lib/job-automation.js";

assert.equal(
  getAutoApplyRejectionReason({
    source: "gupy",
    source_url:
      "https://vaga-ja.com/vagas/fitness-brasil-ltda/analista-de-marketing-digital-hibrido?jobBoardSource=gupy_portal",
  }),
  "unsupported_apply_method",
);

assert.equal(
  isAutoApplySupported({
    source: "gupy",
    source_url: "https://empresa.gupy.io/jobs/123?jobBoardSource=gupy_portal",
  }),
  true,
);

assert.equal(
  isAutoApplySupported({
    source: "catho",
    source_url: "https://www.catho.com.br/vagas/supervisor-de-marketing/36403512",
  }),
  true,
);

assert.equal(
  getAutoApplyRejectionReason({
    source: "linkedin",
    source_url: "https://linkedin.com/jobs/1",
  }),
  "unsupported_source",
);
