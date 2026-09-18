# Blog cover photo provenance

These files are served only from `/blog-images/`, as the cover on each article's
card at `/guides`. One per guide, keyed from `image` in `lib/guides.ts`.

Same purpose as `public/assets/schools/SOURCES.md`: record where each production
asset came from, so nothing ships whose licence nobody can name. Add a row here
in the same commit that adds the file.

Every file in this directory is WebP, sRGB, with no ICC profile and no EXIF.
`scripts/sitemap.test.mjs` fails the build if a registry entry points at a file
that is not here.

## Licensed and recorded

### `engineering.webp`

| | |
|---|---|
| Used by | `/guides/engineering-application-essays` |
| Source | Unsplash |
| Photographer | Dominic Kurniawan Suryaputra |
| URL | https://unsplash.com/photos/a-large-library-filled-with-lots-of-books-r0U2y0HhdGE |
| Licence | Unsplash License |
| Downloaded | 2026-09-18, by Ritvik |
| Original | 4240x2832 progressive JPEG, 5,018,397 bytes |
| Shipped | 1200x800 WebP, quality 72, 121,970 bytes |

Converted with the `sharp` already present in `node_modules` as a Next
dependency, resized `fit: 'cover'` (the source is 3:2, so the crop is
negligible) and written without `withMetadata()`, which is what drops the ICC
profile and EXIF the source carried.

1200x800 is the size `app/guides/page.tsx` declares on the `<img>`, and is the
only file here for which that declaration is true. It covers the card at 2x on
both widths: the card is 507 CSS px wide at 1440 and 360 at 390, both measured.

The Unsplash License permits commercial use without permission or attribution.
Attribution is recorded here anyway, because a file whose licence is only in
somebody's memory is a file that cannot be cleared later.

## Provenance not recorded

The other seven were added in one commit, `57d5c5c` "Add unique Blog photos and
staggered dates", on 2026-08-21. **That commit records no source, photographer,
licence or URL for any of them**, and nothing else in the repository does
either, so this file cannot state one without inventing it.

`common-app-examples.webp`, `essay-format.webp`, `inspiration.webp`,
`start-college-essay.webp`, `uc-piq.webp`, `why-college.webp`,
`word-count.webp`.

Worth filling in from whoever sourced them. They are the only images on the
public site whose licence is unrecorded.

### `inspiration.webp` carries a stock agency watermark

**Escalate before touching it.** The file has a preview watermark baked into the
pixels, a script wordmark reading `dreamstime` in a band across the horizontal
centre. It is faint against a bright background and invisible at a glance, which
is presumably how it shipped, but it is legible once contrast is raised and it
is legible in the image itself at full size.

A watermark of that kind is on a comp rather than on a licensed download, so
this is very likely an unlicensed preview serving in production on the
`/guides` card for `how-to-take-inspiration-from-college-essays`.

Found 2026-09-18 while placing `engineering.webp`. The centre band of all eight
files in this directory was checked at raised contrast; **this is the only one**.
Not changed here: it predates this branch, and a licensing question is Fatimah's
to answer rather than something to quietly swap out.

## What the seven actually are, measured

Recorded because "match the existing ones" is not a well defined instruction
here: they agree on format and on nothing else.

| File | Pixels | Ratio | Size |
|---|---|---|---|
| `word-count.webp` | 600x400 | 1.500 | 17.4 KB |
| `start-college-essay.webp` | 612x408 | 1.500 | 31.4 KB |
| `uc-piq.webp` | 640x420 | 1.524 | 38.5 KB |
| `common-app-examples.webp` | 648x392 | 1.653 | 26.0 KB |
| `inspiration.webp` | 800x506 | 1.581 | 26.6 KB |
| `essay-format.webp` | 1000x600 | 1.667 | 27.2 KB |
| `why-college.webp` | 1400x934 | 1.499 | 314.3 KB |
| `engineering.webp` | 1200x800 | 1.500 | 119.1 KB |

The card is `object-fit: cover`, so the ratio spread is invisible. The pixel
spread is not: the six small files are upscaled on a 2x display, which is why
this one was cut to the declared 1200x800 rather than to their median.
