/**
 * Structured browser-side logger for debugging Atelier.
 *
 * Every message is prefixed with a high-resolution timestamp, category tag,
 * and severity so that crashes on specific machines are easy to trace in
 * the DevTools console.
 *
 * Usage:
 *   import { log } from "@/lib/logger";
 *   log.info("ModelBuilder", "handleFit started", { terms: 3, family: "poisson" });
 */

type Severity = "DEBUG" | "INFO" | "WARN" | "ERROR";

function ts(): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function fmt(severity: Severity, tag: string, msg: string): string {
  return `${ts()} | ${severity.padEnd(5)} | [${tag}] ${msg}`;
}

function emit(
  severity: Severity,
  tag: string,
  msg: string,
  data?: unknown,
) {
  const line = fmt(severity, tag, msg);
  switch (severity) {
    case "ERROR":
      data !== undefined ? console.error(line, data) : console.error(line);
      break;
    case "WARN":
      data !== undefined ? console.warn(line, data) : console.warn(line);
      break;
    case "DEBUG":
      data !== undefined ? console.debug(line, data) : console.debug(line);
      break;
    default:
      data !== undefined ? console.log(line, data) : console.log(line);
  }
}

export const log = {
  debug: (tag: string, msg: string, data?: unknown) => emit("DEBUG", tag, msg, data),
  info:  (tag: string, msg: string, data?: unknown) => emit("INFO",  tag, msg, data),
  warn:  (tag: string, msg: string, data?: unknown) => emit("WARN",  tag, msg, data),
  error: (tag: string, msg: string, data?: unknown) => emit("ERROR", tag, msg, data),
};
