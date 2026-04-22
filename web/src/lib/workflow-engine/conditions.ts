import type {
  JsonPrimitive,
  WorkflowCondition,
  WorkflowConditionGroup,
  WorkflowEvaluationContext,
} from "@/lib/workflow-engine/types";

type EvaluationResult = {
  matched: boolean;
  checked: number;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isCondition(value: unknown): value is WorkflowCondition {
  if (!isRecord(value)) return false;
  if (typeof value.path !== "string" || !value.path.trim()) return false;
  if (typeof value.op !== "string") return false;
  return ["eq", "neq", "in", "not_in", "contains", "exists", "gt", "gte", "lt", "lte"].includes(value.op);
}

function normalizeConditionList(value: unknown): WorkflowCondition[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCondition);
}

export function parseConditionGroup(raw: unknown): WorkflowConditionGroup {
  if (!isRecord(raw)) return { all: [] };
  return {
    all: normalizeConditionList(raw.all),
    any: normalizeConditionList(raw.any),
    none: normalizeConditionList(raw.none),
  };
}

function getValueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, source);
}

function comparableNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compare(condition: WorkflowCondition, context: WorkflowEvaluationContext): boolean {
  const actual = getValueAtPath(context, condition.path);
  const expected = condition.value;

  switch (condition.op) {
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual as JsonPrimitive);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual as JsonPrimitive);
    case "contains":
      if (Array.isArray(actual)) return isPrimitive(expected) && actual.includes(expected);
      if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
      return false;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = comparableNumber(actual);
      const right = comparableNumber(expected);
      if (left === null || right === null) return false;
      if (condition.op === "gt") return left > right;
      if (condition.op === "gte") return left >= right;
      if (condition.op === "lt") return left < right;
      return left <= right;
    }
    default:
      return false;
  }
}

export function evaluateConditions(
  group: WorkflowConditionGroup,
  context: WorkflowEvaluationContext
): EvaluationResult {
  const all = group.all ?? [];
  const any = group.any ?? [];
  const none = group.none ?? [];
  const checked = all.length + any.length + none.length;

  const allMatched = all.every((condition) => compare(condition, context));
  if (!allMatched) return { matched: false, checked, reason: "all_condition_failed" };

  const anyMatched = any.length === 0 || any.some((condition) => compare(condition, context));
  if (!anyMatched) return { matched: false, checked, reason: "any_condition_failed" };

  const noneMatched = none.some((condition) => compare(condition, context));
  if (noneMatched) return { matched: false, checked, reason: "none_condition_matched" };

  return { matched: true, checked };
}
