// House style for the ttt-workflows operator playbooks.
//
// Bundled typst fonts ONLY (Libertinus Serif, New Computer Modern fallback,
// DejaVu Sans Mono) so a PDF built here is byte-for-byte reproducible on any
// machine. Build with `--ignore-system-fonts` to enforce that. One accent,
// restrained, print-first. Content files import `skill-doc` and write body
// prose only — never styling.

#let ink = rgb("#22252b")
#let muted = rgb("#6b7280")
#let accent = rgb("#1b4d57")
#let paper = rgb("#fcfbf9")
#let panel = rgb("#eef1f0")
#let hair = rgb("#dcded9")

#let serif = ("Libertinus Serif", "New Computer Modern")
#let mono = ("DejaVu Sans Mono",)

#let skill-doc(
  name: "",
  slug: "",
  tagline: "",
  produces: "",
  when: "",
  never: "",
  body,
) = {
  set document(title: name + " — operator's playbook", author: "TTT Studios", date: none)
  set page(
    paper: "a4",
    margin: (x: 2.4cm, top: 2.3cm, bottom: 1.9cm),
    fill: paper,
    footer: context [
      #set text(8pt, fill: muted, font: serif)
      #smallcaps(slug) #h(1fr)
      #counter(page).get().first() / #counter(page).final().first()
    ],
  )
  set text(font: serif, size: 10.5pt, fill: ink, lang: "en")
  set par(justify: true, leading: 0.66em, spacing: 1.05em, first-line-indent: 0pt)
  set list(spacing: 0.9em, indent: 0.6em)
  set enum(spacing: 0.9em, indent: 0.6em)

  show heading: set text(fill: accent, weight: 600)
  show heading: set block(above: 1.3em, below: 0.7em)
  show heading.where(level: 1): it => [
    #set text(15pt)
    #block(it.body)
    #v(-0.35em)
    #line(length: 100%, stroke: 0.6pt + hair)
  ]
  show heading.where(level: 2): set text(12pt)
  show heading.where(level: 3): set text(10.5pt, fill: ink)

  show raw: set text(font: mono, size: 8.7pt)
  show raw.where(block: true): it => block(
    fill: panel,
    inset: 9pt,
    radius: 3pt,
    width: 100%,
    stroke: 0.5pt + hair,
    it,
  )
  show raw.where(block: false): it => box(
    fill: panel,
    inset: (x: 2.5pt, y: 0pt),
    outset: (y: 2.5pt),
    radius: 2pt,
    it,
  )
  show link: set text(fill: accent)
  set underline(offset: 2pt)

  // ── Title block ─────────────────────────────────────────────────────────
  block(spacing: 0.35em, text(23pt, weight: 700, fill: ink)[#name])
  block(text(11pt, fill: muted, style: "italic")[#tagline])
  v(0.5em)

  // ── At-a-glance panel ───────────────────────────────────────────────────
  block(
    fill: panel,
    inset: 12pt,
    radius: 4pt,
    width: 100%,
    stroke: 0.5pt + hair,
    breakable: false,
    [
      #set text(9.5pt)
      #let lbl(t) = text(weight: 600, fill: accent)[#smallcaps(t)]
      #grid(
        columns: (auto, 1fr),
        gutter: 12pt,
        row-gutter: 7pt,
        lbl("Produces"), produces,
        lbl("Use it when"), when,
        lbl("Never"), never,
      )
    ],
  )
  v(0.7em)

  body
}
