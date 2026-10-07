# Documentation toolkit

This toolkit is isolated from application dependencies. It builds the project specific Markdown corpus, 32 separately editable Mermaid diagrams with SVG/PNG exports, and 16 editable Word documents.

## Requirements

Use the supplied documentation Python environment with `python-docx` and Pillow. If preparing a standalone virtual environment, install only `tools/docs/requirements.txt`; no app package or lockfile needs changes.

## Rebuild

Run from the repository root:

```powershell
python tools/docs/build_documentation.py
```

Markdown documents under `docs/` and Mermaid files under `docs/01-architecture/diagrams/sources/` are editable sources. On first build, the generator seeds missing Markdown pages from its templates; later builds preserve existing Markdown edits and refresh Word exports from those pages. The Prisma data dictionary, indexes, screenshot checklist and diagram renders are derived outputs and are regenerated. For diagram topology changes, edit the Mermaid source and corresponding diagram definition in the builder, then rebuild/review the SVG and PNG together.

## Validate

```powershell
python tools/docs/validate_documentation.py
```

Static checks cover required files, relative links, 32 diagram source/export pairs, 16 Word files, declared verification states and an obvious-secret scan. A passing validator does not perform application tests, Mermaid CLI parsing, browser UI validation, DOCX visual verification, penetration testing, or production readiness attestation.

## Mermaid and images

Every flow has a `.mmd` file under `docs/01-architecture/diagrams/sources/`; SVG and PNG exports are colocated by format. The checked-in renderer intentionally uses a small deterministic node/edge rendering implementation for the diagrams defined by this source generator. Use a Mermaid renderer of choice to alter layout after editing a source; update the generator and the SVG/PNG exports together.

## Word exports

Word files are generated from Markdown source documents and remain editable. They are distribution copies; Markdown remains the primary source. Correct text in Markdown and rebuild rather than making an untracked correction in only one Word export.
