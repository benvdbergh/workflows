#!/usr/bin/env node
/**
 * CLI entrypoint: validate canonical JSON workflow documents against the POC schema.
 * Usage: node packages/engine/src/cli.mjs validate [<file>|-]
 * Omit file or use `-` to read JSON from stdin.
 */
import { readFile } from "node:fs/promises";
import { validateWorkflowDefinition } from "./validate.mjs";

function usage() {
  process.stderr.write(
    "Usage: workflows-engine validate [<file>]\n" +
      "  Validates a workflow JSON document against schemas/workflow-definition-poc.json.\n" +
      "  If <file> is omitted or `-`, reads JSON from stdin.\n" +
      "  Exit: 0 valid, 1 validation failed, 2 usage / I/O / JSON parse error.\n"
  );
}

/**
 * @returns {Promise<string>}
 */
async function readStdinUtf8() {
  const chunks = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join("");
}

/**
 * @param {string | undefined} fileArg
 */
async function readWorkflowJson(fileArg) {
  const raw =
    fileArg === undefined || fileArg === "-"
      ? await readStdinUtf8()
      : await readFile(fileArg, "utf8");
  return JSON.parse(raw);
}

function printValidationErrors(errors) {
  for (const err of errors) {
    const line = [
      err.instancePath !== "" ? `instancePath: ${err.instancePath}` : "instancePath: (root)",
      `keyword: ${err.keyword}`,
      err.schemaPath !== undefined ? `schemaPath: ${err.schemaPath}` : null,
      err.params && Object.keys(err.params).length ? `params: ${JSON.stringify(err.params)}` : null,
      err.message ? `message: ${err.message}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    process.stderr.write(`${line}\n`);
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd !== "validate") {
    usage();
    process.exitCode = 2;
    return;
  }
  const fileArg = rest[0];
  let data;
  try {
    data = await readWorkflowJson(fileArg);
  } catch (e) {
    process.stderr.write(`engine validate: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = validateWorkflowDefinition(data);
  if (result.ok) {
    process.stdout.write("OK: document matches POC workflow schema.\n");
    return;
  }
  process.stderr.write("Validation failed:\n");
  printValidationErrors(result.errors ?? []);
  process.exitCode = 1;
}

main();
