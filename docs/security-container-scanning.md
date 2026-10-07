# Image scanning policy

Container image scans keep HIGH and CRITICAL findings as a failing gate. Trivy is invoked with `--ignore-unfixed` so operating-system findings that have no upstream fix available do not block builds without a remediation path. Any finding for which Trivy reports a fix remains visible and continues to fail the scan. This is not a CVE allowlist; the filesystem scan and production dependency audit retain their existing severity gates.
