/**
 * The internal-route rule, in one place.
 *
 * Deliberately dependency-free: the schema (zod), the HTML validator, and the
 * browser-side form all need this rule, and the form must not pull zod into the
 * client bundle to get it.
 *
 * Any `#nav/...` route, query string included — tag pages look like
 * `#nav/tagsview?browse=tiles&id=1143&objectType=oetag&masterTagId=1063`.
 * Requiring a non-whitespace character after the slash rejects a bare `#nav/`,
 * and anything carrying a scheme (`http:`, `javascript:`) fails the prefix.
 *
 * No `g` flag — this is shared and `.test()` must stay stateless.
 */
export const NAV_HREF = /^#nav\/\S+$/;
