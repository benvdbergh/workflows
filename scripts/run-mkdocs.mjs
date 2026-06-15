#!/usr/bin/env node
/**
 * Run mkdocs using a project-local venv (website/.venv) so npm scripts do not
 * depend on whichever `python` happens to be first on PATH.
 *
 * Usage: node scripts/run-mkdocs.mjs <mkdocs-subcommand> [args...]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const WEBSITE = join(ROOT, "website");
const VENV_DIR = join(WEBSITE, ".venv");
const REQUIREMENTS = join(WEBSITE, "requirements.txt");

function isWindows() {
  return process.platform === "win32";
}

function venvPython() {
  return isWindows()
    ? join(VENV_DIR, "Scripts", "python.exe")
    : join(VENV_DIR, "bin", "python");
}

function pythonCandidates() {
  const fromEnv = process.env.WORKFLOWS_DOCS_PYTHON?.trim();
  const candidates = fromEnv
    ? [fromEnv]
    : isWindows()
      ? ["py -3", "py", "python3", "python"]
      : ["python3", "python"];
  return candidates;
}

function runShell(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPython(pythonPath, args) {
  runShell(pythonPath, args);
}

function tryVersion(pythonPath) {
  const result = spawnSync(pythonPath, ["--version"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return result.status === 0;
}

function resolveBootstrapPython() {
  for (const candidate of pythonCandidates()) {
    if (candidate.includes(" ")) {
      if (tryVersion(candidate)) return candidate;
      continue;
    }
    if (tryVersion(candidate)) return candidate;
  }
  console.error(
    "Could not find Python 3 for docs venv.\n" +
      "Install Python 3.11+ or set WORKFLOWS_DOCS_PYTHON to your python executable.",
  );
  process.exit(1);
}

function ensureVenv() {
  const python = venvPython();
  if (existsSync(python)) {
    return python;
  }

  mkdirSync(WEBSITE, { recursive: true });
  const bootstrap = resolveBootstrapPython();
  console.error(`Creating docs venv at ${VENV_DIR}`);

  if (bootstrap.includes(" ")) {
    const [launcher, ...launcherArgs] = bootstrap.split(" ");
    runShell(launcher, [...launcherArgs, "-m", "venv", VENV_DIR]);
  } else {
    runPython(bootstrap, ["-m", "venv", VENV_DIR]);
  }

  if (!isWindows()) {
    try {
      chmodSync(python, 0o755);
    } catch {
      // best effort
    }
  }

  return python;
}

function ensureDeps(python) {
  console.error("Installing docs Python dependencies...");
  runPython(python, ["-m", "pip", "install", "-q", "-r", REQUIREMENTS]);
}

function main() {
  const mkdocsArgs = process.argv.slice(2);
  if (mkdocsArgs.length === 0) {
    console.error("Usage: node scripts/run-mkdocs.mjs <mkdocs-subcommand> [args...]");
    process.exit(1);
  }

  const python = ensureVenv();
  ensureDeps(python);
  runPython(python, ["-m", "mkdocs", ...mkdocsArgs]);
}

main();
