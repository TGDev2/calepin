/**
 * Traceability (CAL-022) — the audit block every mutable entity carries, the
 * actor scope it is filled from, and the Prisma extension that fills it.
 */

export type { AuditContext } from "./context";
export { getAuditContext, getContextActorId, runWithActor } from "./context";
export type { AuditExtensionOptions } from "./extension";
export { auditExtension } from "./extension";
export type { AuditedWriteOperation } from "./fields";
export { applyAuditFields, AUDITED_WRITE_OPERATIONS, isAuditedWriteOperation } from "./fields";
export type { AuditedModel, AuditedModelName, AuditStatusKind } from "./models";
export {
  AUDIT_AUTHOR_COLUMN,
  AUDIT_AUTHOR_FIELD,
  AUDIT_AUTHOR_RELATION,
  AUDIT_UNATTRIBUTED,
  AUDIT_VERSION_FIELD,
  AUDITED_MODEL_NAMES,
  AUDITED_MODELS,
  isAuditedModel,
  UNAUDITED_MUTABLE_MODELS,
} from "./models";
