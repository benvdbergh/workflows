#!/usr/bin/env node
/**
 * CLI entrypoint: validate workflow JSON and operator MCP manifests.
 * Usage:
 *   workflows-engine validate [<file>|-]
 *   workflows-engine mcp-manifest validate <file>
 */
import { readFile } from "node:fs/promises";
import { readAndValidateMcpOperatorManifestFile } from "./config/mcp-operator-manifest.mjs";
import { validateWorkflowDefinition } from "./validate.mjs";

function usage() {
  process.stderr.write(
    "Usage:\n" +
      "  workflows-engine validate [<file>]\n" +
      "    Validates a workflow JSON document against schemas/workflow-definition-poc.json.\n" +
      "    If <file> is omitted or `-`, reads JSON from stdin.\n" +
      "  workflows-engine mcp-manifest validate <file>\n" +
      "    Validates an operator MCP manifest (Cursor-style mcpServers subset).\n" +
      "    See docs/architecture/mcp-operator-manifest.md.\n" +
      "Exit: 0 valid, 1 validation failed, 2 usage / I/O / JSON parse error.\n"
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

async function cmdValidateWorkflow(rest) {
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

async function cmdValidateMcpManifest(rest) {
  const fileArg = rest[0];
  if (!fileArg || fileArg === "-") {
    process.stderr.write("engine mcp-manifest validate: requires a manifest file path.\n");
    process.exitCode = 2;
    return;
  }
  const result = await readAndValidateMcpOperatorManifestFile(fileArg);
  if (result.ok) {
    process.stdout.write("OK: manifest matches MCP operator manifest schema.\n");
    return;
  }
  process.stderr.write("Validation failed:\n");
  printValidationErrors(result.errors ?? []);
  process.exitCode = 1;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "validate") {
    await cmdValidateWorkflow(rest);
    return;
  }
  if (cmd === "mcp-manifest" && rest[0] === "validate") {
    await cmdValidateMcpManifest(rest.slice(1));
    return;
  }
  usage();
  process.exitCode = 2;
}

main();
