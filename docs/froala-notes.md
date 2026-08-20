# Froala / OvalEdge HTML Notes

Ground truth: derived from a working, hand-built `homepage.html` (RaceTrac) that pastes
cleanly into OvalEdge's homepage editor, plus a live capture of the image upload request.
Everything the template generates must stay inside this vocabulary.

## Layout

- **Tables only.** No flexbox, no CSS grid. Every layout block is `<table><tbody><tr><td>`.
- `<tbody>` is always present explicitly — never omit it.
- Three-column card rows: three `<td>` elements inside one `<tr>`, each with an inline
  `width` percentage (e.g. `width:33.33%`).
- No `class` or `id` attributes of our own. The only class ever seen is Froala's own
  `fr-fic fr-dib` on `<img>` — don't add custom classes, they won't be preserved reliably.

## Allowed tags

```
table  tbody  tr  td  div  p  span  strong  br  a  img  hr
```

No `<h1>`–`<h6>` — headings are done as `<span>` with an inline `font-size`. No `<style>`
block, no `<script>`.

## Allowed inline CSS properties

```
padding  font-size  color  font-family  border-radius  background-color
width  max-width  text-align  line-height  font-weight  display  margin
margin-bottom  vertical-align  min-height  border  border-top  letter-spacing
```

Stay within this list until a new property has been tested and confirmed to survive a
save/reload round trip. Everything is inline — no external stylesheet, no `<style>` block.

## Fonts

Web-safe stacks only, declared inline every time:

```
font-family:Arial, Helvetica, sans-serif;
font-family:Arial Black, Arial, Helvetica, sans-serif;   /* for heavy headline weight */
```

No external font imports, no proprietary/branded fonts.

## Spacing conventions seen in the working file

- `&nbsp;` padding text inside styled `<span>` blocks (a manual-editor artifact, not
  strictly required — safe to omit in generated output).
- Section separators are a bare `<br>` between tables, not margin/padding on the table
  itself.

## Links

Internal navigation only, as hash routes — never external URLs. Any `#nav/...` route
is allowed, including one carrying a query string.

Quick Access destinations:

```
#nav/search
#nav/glossary
#nav/marketplace
#nav/lineage
```

Tag pages, confirmed in a paste test — note the query string:

```
#nav/tagsview?browse=tiles&id=1143&objectType=oetag&masterTagId=1063
```

The `&` separators must be written as `&amp;` in the `href` attribute; that is ordinary
attribute encoding and survives a save/reload round trip.

Rule for the validator: an `href` must match `#nav/` followed by at least one
non-whitespace character. Anything carrying a scheme — `http:`, `https:`, `javascript:` —
is rejected, as is a protocol-relative `//host/path`.

## Images

```html
<img class="fr-fic fr-dib" style="width:190px; max-width:100%;"
     src="ovaledgeimages/editorimage/<uuid>">
```

- Relative path, no host. Hero/logo images stay modest — around 190px wide, not dominant.
- The `<uuid>` must come from a real upload response. **Never invent a placeholder UUID** —
  a fabricated one renders as a broken image with no visible error in the editor.

### Upload endpoint (confirmed, not yet automated in v1)

```
POST https://<tenant>.ovaledge.cloud/wikicontroller/setWikiImage
Content-Type: multipart/form-data

Form fields:
  objectId          = <id of an existing story/page>
  objectType        = story
  type              = oestory
  imageUploadParams = <binary file>

Auth: X-Csrf-Token header + session cookie (browser session, not an API key)

Response:
  { "link": "ovaledgeimages/editorimage/<uuid>" }
```

Notes for whenever this gets automated (not v1):
- Upload is **scoped to an existing object** via `objectId` — there's no upload-first,
  attach-later flow. A story/page must exist before you can upload into it.
- Auth is session-based (CSRF token + cookie), not a bearer token — automating this means
  either scripting a login and refreshing the session, or real browser automation. Treat as
  a deliberate, explicitly-approved decision, not a default.
- **v1 behavior:** logo upload stays manual. The generated HTML ships with the `<img>` tag
  and a clearly marked placeholder src; you upload the logo yourself and paste in the real
  UUID.

## Validator checklist (run on every generated HTML string)

- [ ] No `<script>`, no `<style>` block
- [ ] No tag outside the allowed list above
- [ ] No CSS property outside the allowed list above
- [ ] No external `src`/`href` (images and links are relative or `#nav/...` only)
- [ ] No invented image UUID
- [ ] Every `<table>` has an explicit `<tbody>`
