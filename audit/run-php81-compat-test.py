"""Run an existing isolated suite under official PHP 8.1 without editing it.

Only its PHP executable assignment and output-report filename are replaced in
the parsed syntax tree. Test assertions, fixtures and production code are intact.
"""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PHP = ROOT / "audit-evidence/tools/php-8.1.34/php.exe"
ARCHIVE = ROOT / "audit-evidence/tools/php-8.1.34-nts-Win32-vs16-x64.zip"
EXPECTED_SHA = "9cfe246cb144076c16f5913a3ef88a474c3dd7e60f0f0c8bb95faf68674016cc"
OUTPUT = ROOT / "audit-evidence/php81-verification"
SUITES = {
    "cms": ("tests/cms-backend-test.py", "audit/cms-backend-test-results.json"),
    "roles": ("tests/staff-permissions-test.py", "audit/staff-permissions-results.json"),
    "security": ("audit/backend-security-test.py", "audit/backend-security-test-results.json"),
    "session": ("tests/session-bootstrap-test.py", "audit/session-bootstrap-results.json"),
    "notifications": ("audit/notification-test.py", "audit/notification-test-results.json"),
}


class RuntimeSelection(ast.NodeTransformer):
    def __init__(self, report):
        self.report = report
        self.php_changes = 0
        self.report_changes = 0

    def visit_Assign(self, node):
        if any(isinstance(target, ast.Name) and target.id == "PHP" for target in node.targets):
            self.php_changes += 1
            node.value = ast.Call(func=ast.Name(id="Path", ctx=ast.Load()),
                                  args=[ast.Constant(value=str(PHP))], keywords=[])
            return node
        return self.generic_visit(node)

    def visit_Constant(self, node):
        if node.value == self.report:
            self.report_changes += 1
            return ast.copy_location(ast.Constant(value=str(OUTPUT / Path(self.report).name)), node)
        return node


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", choices=SUITES)
    args = parser.parse_args()
    assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() == EXPECTED_SHA, "Official archive hash mismatch"
    version = subprocess.check_output([str(PHP), "-r", "echo PHP_VERSION;"], text=True).strip()
    assert version == "8.1.34", "Unexpected PHP runtime"
    source, report = SUITES[args.suite]
    source_path = ROOT / source
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tree = ast.parse(source_path.read_text(encoding="utf-8-sig"), filename=str(source_path))
    selection = RuntimeSelection(report)
    tree = ast.fix_missing_locations(selection.visit(tree))
    assert selection.php_changes == 1 and selection.report_changes == 1, "Suite layout changed; inspect before running"
    metadata = {
        "suite": args.suite, "runtime": version, "source": source,
        "sourceSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "archiveSha256": EXPECTED_SHA,
        "downloadUrl": "https://windows.php.net/downloads/releases/archives/" + ARCHIVE.name,
        "checksumSource": "https://windows.php.net/downloads/releases/releases.json",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "report": str((OUTPUT / Path(report).name).relative_to(ROOT)),
        "onlyOverrides": ["PHP executable", "output report destination"],
    }
    try:
        exec(compile(tree, str(source_path), "exec"), {"__name__": "__main__", "__file__": str(source_path)})
        report_path = OUTPUT / Path(report).name
        result = json.loads(report_path.read_text(encoding="utf-8"))
        if "runtime" in result:
            result["originalSuiteRuntimeLabel"] = result["runtime"]
        result["runtime"] = "PHP " + version + " Windows (verified executable)"
        result["runtimeEvidence"] = args.suite + "-runtime.json"
        report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        metadata["status"] = "PASS"
    except BaseException as error:
        metadata["status"] = "FAIL"
        metadata["error"] = str(error)
        raise
    finally:
        metadata["completedAt"] = datetime.now(timezone.utc).isoformat()
        (OUTPUT / (args.suite + "-runtime.json")).write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
