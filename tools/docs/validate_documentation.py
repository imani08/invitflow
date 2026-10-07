#!/usr/bin/env python3
"""Static integrity checks for the generated documentation tree."""
from __future__ import annotations

import re
import struct
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
ERRORS: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


def main() -> int:
    diagrams = sorted((DOCS / "01-architecture/diagrams/sources").glob("*.mmd"))
    require(len(diagrams) == 32, f"Expected 32 Mermaid sources, found {len(diagrams)}")
    catalog=(DOCS/"01-architecture/DIAGRAM_CATALOG.md").read_text(encoding="utf-8") if (DOCS/"01-architecture/DIAGRAM_CATALOG.md").exists() else ""
    for source in diagrams:
        stem = source.stem
        svg=DOCS/"01-architecture/diagrams/svg"/f"{stem}.svg"
        png=DOCS/"01-architecture/diagrams/png"/f"{stem}.png"
        require(svg.is_file() and svg.stat().st_size > 100, f"Missing/empty diagram SVG: {svg.relative_to(ROOT)}")
        require(png.is_file() and png.stat().st_size > 100, f"Missing/empty diagram PNG: {png.relative_to(ROOT)}")
        require(stem in catalog, f"Diagram missing from catalog: {stem}")
        if svg.is_file():
            try: ET.parse(svg)
            except ET.ParseError as exc: require(False, f"Invalid SVG XML {svg.relative_to(ROOT)}: {exc}")
        if png.is_file():
            raw=png.read_bytes()[:24]
            require(len(raw)==24 and raw[:8]==b"\x89PNG\r\n\x1a\n" and struct.unpack(">II",raw[16:24])!=(0,0), f"Invalid PNG header/dimensions: {png.relative_to(ROOT)}")
        text = source.read_text(encoding="utf-8")
        require(text.splitlines()[0] in {"flowchart LR", "sequenceDiagram", "stateDiagram-v2", "erDiagram"}, f"Unknown Mermaid source type: {source}")

    docx = sorted((DOCS / "dist/docx").glob("*.docx"))
    expected_docx = {
        "01_Vision_Produit_InvitaFlow.docx", "02_Cahier_Des_Charges_SRS_InvitaFlow.docx", "03_Architecture_InvitaFlow.docx",
        "04_Architecture_Securite_InvitaFlow.docx", "05_Modele_Donnees_InvitaFlow.docx", "06_API_Integration_InvitaFlow.docx",
        "07_Architecture_Paiement_InvitaFlow.docx", "08_Strategie_Tests_InvitaFlow.docx", "09_Runbook_Exploitation_InvitaFlow.docx",
        "10_Deployment_InvitaFlow.docx", "11_Backup_Disaster_Recovery_InvitaFlow.docx", "12_Release_Readiness_InvitaFlow.docx",
        "13_Guide_Utilisateur_InvitaFlow.docx", "14_Guide_Administrateur_InvitaFlow.docx", "15_Guide_Agence_InvitaFlow.docx",
        "16_Guide_Partenaire_InvitaFlow.docx",
    }
    found_docx = {path.name for path in docx}
    require(expected_docx.issubset(found_docx), f"Missing named DOCX exports: {sorted(expected_docx-found_docx)}")
    require(len(docx) == 16, f"Expected exactly 16 canonical DOCX exports in docs/dist/docx/, found {len(docx)}")
    sources = {
        "01_Vision_Produit_InvitaFlow.docx":"00-product/PRODUCT_VISION.md", "02_Cahier_Des_Charges_SRS_InvitaFlow.docx":"00-product/SRS.md",
        "03_Architecture_InvitaFlow.docx":"01-architecture/ARCHITECTURE.md", "04_Architecture_Securite_InvitaFlow.docx":"04-security/SECURITY_ARCHITECTURE.md",
        "05_Modele_Donnees_InvitaFlow.docx":"02-data/ERD.md", "06_API_Integration_InvitaFlow.docx":"03-api/API_GUIDE.md",
        "07_Architecture_Paiement_InvitaFlow.docx":"05-payments/PAYMENT_PROVIDER_ARCHITECTURE.md", "08_Strategie_Tests_InvitaFlow.docx":"07-testing/TEST_STRATEGY.md",
        "09_Runbook_Exploitation_InvitaFlow.docx":"08-operations/RUNBOOK.md", "10_Deployment_InvitaFlow.docx":"08-operations/DEPLOYMENT.md",
        "11_Backup_Disaster_Recovery_InvitaFlow.docx":"08-operations/BACKUP_RECOVERY.md", "12_Release_Readiness_InvitaFlow.docx":"09-release/RELEASE_READINESS_REPORT.md",
        "13_Guide_Utilisateur_InvitaFlow.docx":"10-user-guides/END_USER_GUIDE.md", "14_Guide_Administrateur_InvitaFlow.docx":"10-user-guides/ADMIN_GUIDE.md",
        "15_Guide_Agence_InvitaFlow.docx":"10-user-guides/AGENCY_GUIDE.md", "16_Guide_Partenaire_InvitaFlow.docx":"10-user-guides/PARTNER_GUIDE.md",
    }
    word_texts: dict[Path,str] = {}
    for path in docx:
        require(path.stat().st_size > 1500, f"DOCX too small: {path.relative_to(ROOT)}")
        try:
            with zipfile.ZipFile(path) as archive:
                corrupt=archive.testzip()
                require(corrupt is None, f"Corrupt ZIP member in {path.relative_to(ROOT)}: {corrupt}")
                require("word/document.xml" in archive.namelist(), f"DOCX is missing word/document.xml: {path.name}")
                require("[Content_Types].xml" in archive.namelist(), f"DOCX is missing content types: {path.name}")
                xml=ET.fromstring(archive.read("word/document.xml"))
                text=" ".join(node.text or "" for node in xml.iter() if node.tag.endswith("}t"))
                word_texts[path]=text
                require(len(text.strip()) > 100, f"DOCX content is empty: {path.name}")
                folded=text.casefold()
                require("focus hd entreprises" in folded and "invitaflow" in folded, f"DOCX branding missing: {path.name}")
                require("word/media/image1.png" in archive.namelist() if path.name in {"03_Architecture_InvitaFlow.docx","04_Architecture_Securite_InvitaFlow.docx","05_Modele_Donnees_InvitaFlow.docx","07_Architecture_Paiement_InvitaFlow.docx","10_Deployment_InvitaFlow.docx","11_Backup_Disaster_Recovery_InvitaFlow.docx"} else True, f"Expected embedded diagram missing: {path.name}")
        except (zipfile.BadZipFile, ET.ParseError, KeyError) as exc:
            require(False, f"Cannot inspect canonical DOCX {path.name}: {exc}")
        source=sources.get(path.name)
        if source:
            require((DOCS/source).is_file(), f"Missing DOCX Markdown input: {source}")
            require((DOCS/source).read_text(encoding="utf-8").splitlines()[0].lstrip("# ") in word_texts.get(path,""), f"DOCX title does not match source {source}")

    expected = [
        "00-product/SRS.md", "00-product/FUNCTIONAL_REQUIREMENTS.md", "00-product/NON_FUNCTIONAL_REQUIREMENTS.md",
        "01-architecture/ARCHITECTURE.md", "01-architecture/DIAGRAM_CATALOG.md", "02-data/DATA_DICTIONARY.md",
        "03-api/API_GUIDE.md", "04-security/THREAT_MODEL.md", "05-payments/WALLET_ARCHITECTURE.md",
        "06-auth-email/EMAIL_VERIFICATION_FLOW.md", "07-testing/TEST_STRATEGY.md", "08-operations/RUNBOOK.md",
        "08-operations/PRODUCTION_READINESS.md", "09-release/OPEN_ITEMS.md", "10-user-guides/END_USER_GUIDE.md",
        "10-user-guides/ADMIN_GUIDE.md", "10-user-guides/AGENCY_GUIDE.md", "10-user-guides/PARTNER_GUIDE.md",
        "10-user-guides/SCREENSHOT_CHECKLIST.md", "10-user-guides/screenshots/end-user/SCREENSHOT_CHECKLIST.md", "11-legal/README.md", "README.md",
        "adr/README.md", "reports/DOCUMENTATION_AUDIT.md", "reports/ARCHITECTURE_AUDIT.md", "reports/SECURITY_GAPS.md", "reports/OPEN_ITEMS.md",
        "10-user-guides/visual/end-user/README.md", "10-user-guides/visual/admin/README.md", "10-user-guides/visual/agency/README.md", "10-user-guides/visual/partner/README.md",
    ]
    for rel in expected:
        path=DOCS/rel
        require(path.is_file(), f"Missing required document: docs/{rel}")
        if path.is_file(): require(path.stat().st_size>100, f"Required document is empty: docs/{rel}")

    metadata_docs=["README.md","00-product/SRS.md","01-architecture/ARCHITECTURE.md","02-data/DATA_DICTIONARY.md","03-api/API_CATALOG.md","04-security/SECURITY_ARCHITECTURE.md","05-payments/PAYMENT_PROVIDER_ARCHITECTURE.md","06-auth-email/KEYCLOAK_ARCHITECTURE.md","08-operations/RUNBOOK.md","10-user-guides/END_USER_GUIDE.md"]
    for rel in metadata_docs:
        text=(DOCS/rel).read_text(encoding="utf-8",errors="replace")
        for term in ("Version:","Status:","Last updated:","Owner:","Product:"):
            require(term in text, f"Missing {term} metadata in docs/{rel}")

    # Validate relative Markdown file links for the generated documentation, including images.
    link_pattern = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")
    for md in DOCS.rglob("*.md"):
        content = md.read_text(encoding="utf-8", errors="replace")
        for target in link_pattern.findall(content):
            target = target.strip().split()[0].strip("<>")
            if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target_path = target.split("#", 1)[0]
            if not target_path:
                continue
            resolved = (md.parent / target_path).resolve()
            require(resolved.exists(), f"Broken local Markdown link in {md.relative_to(ROOT)}: {target}")

    # Documentation scanner: fail on obvious committed private-key blocks or credential assignments.
    secret_patterns = [
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        re.compile(r"(?i)\b(?:smtp|client|merchant|api)[_-]?(?:password|secret|token)\s*[:=]\s*['\"]?(?!\$\{|<|\*{3,})[^\s'\"]{12,}"),
        re.compile(r"(?i)\b(?:EASYPAY_TOKEN|EASYPAY_CID|KEYCLOAK_SMTP_PASSWORD|client_secret|jwt_secret|database_password)\s*[:=]\s*(?!<|\$\{|example|placeholder)[^\s,;]{8,}"),
        re.compile(r"(?i)\b(?:password|secret)\s*=\s*(?!<|\$\{|example|placeholder|changeme|your_)[^\s,;]{10,}"),
    ]
    for path in list(DOCS.rglob("*.md")) + list(DOCS.rglob("*.mmd")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for pattern in secret_patterns:
            require(not pattern.search(text), f"Potential secret material in {path.relative_to(ROOT)}")

    word_secret_patterns=[
        re.compile(r"(?i)\bEASYPAY_(?:TOKEN|CID)\s*[:=]\s*(?!<|\$\{|example)[A-Za-z0-9._-]{12,}"),
        re.compile(r"(?i)\b(?:KEYCLOAK_SMTP_PASSWORD|client_secret|jwt_secret|database_password)\s*[:=]\s*(?!<|\$\{|example)[^\s,;]{8,}"),
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        re.compile(r"(?i)\b(?:password|secret)\s*=\s*(?!<|\$\{|example|placeholder|changeme|your_)[^\s,;]{10,}"),
    ]
    for path,text in word_texts.items():
        for pattern in word_secret_patterns:
            require(not pattern.search(text), f"Possible secret value in DOCX {path.name}")

    # Scan archived first-generation DOCX too so preservation never bypasses the secret check.
    for path in (DOCS/"_archive").rglob("*.docx") if (DOCS/"_archive").exists() else []:
        try:
            with zipfile.ZipFile(path) as archive:
                xml=ET.fromstring(archive.read("word/document.xml"))
                text=" ".join(node.text or "" for node in xml.iter() if node.tag.endswith("}t"))
                for pattern in word_secret_patterns:
                    require(not pattern.search(text), f"Possible secret value in archived DOCX {path.relative_to(ROOT)}")
        except (zipfile.BadZipFile, ET.ParseError, KeyError) as exc:
            require(False, f"Cannot secret-scan archived DOCX {path.relative_to(ROOT)}: {exc}")

    require("NOT GENERATED" in (DOCS / "10-user-guides/screenshots/end-user/SCREENSHOT_CHECKLIST.md").read_text(encoding="utf-8"), "Screenshot evidence status must remain explicit")
    screenshot_checklist=(DOCS/"10-user-guides/SCREENSHOT_CHECKLIST.md").read_text(encoding="utf-8")
    require("| Required account/role | Status | Filename | Notes |" in screenshot_checklist, "Screenshot checklist columns are incomplete")
    shot_rows=[line for line in screenshot_checklist.splitlines() if line.startswith("| ") and ("end-user" in line.casefold() or "ADM-" in line)]
    require(len(shot_rows)==26, f"Expected 20 end-user and 6 admin screenshot rows, found {len(shot_rows)}")
    require(all("| NOT GENERATED |" in line for line in shot_rows), "Every current screenshot plan row must remain NOT GENERATED")
    require("NOT VERIFIED" in (DOCS / "08-operations/PRODUCTION_READINESS.md").read_text(encoding="utf-8"), "Production readiness report must remain unverified")
    if ERRORS:
        print("Documentation validation failed:")
        for error in ERRORS:
            print(f"- {error}")
        return 1
    print(f"Documentation validation passed: {len(diagrams)} source/PNG/SVG sets; 16 canonical DOCX structurally valid (ZIP/XML/brand/content); 20 end-user and 6 admin screenshot rows NOT GENERATED; required docs, relative links and secret scan including archived DOCX.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
