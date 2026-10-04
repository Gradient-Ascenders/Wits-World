# Wits World font inventory

Fonts are served locally from bundled WOFF2 files. No third-party font request is made at runtime. All font licenses are SIL Open Font License 1.1 and are retained verbatim beside the assets.

| Family         | Styles                                              | Source                                                            |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Source Serif 4 | Variable Roman, weights 200–900, optical sizes 8–60 | [Adobe Source Serif](https://github.com/adobe-fonts/source-serif) |
| Source Sans 3  | Variable upright and italic, weights 200–900        | [Adobe Source Sans](https://github.com/adobe-fonts/source-sans)   |

The UI uses weights 400, 500, 600, and 700. Serif italic is not bundled because no serif role currently requires it. System fallback stacks, semantic monospace, and color emoji are defined separately. Typography role and accessibility requirements are documented in [DESIGN.md](../../../DESIGN.md#typography).
