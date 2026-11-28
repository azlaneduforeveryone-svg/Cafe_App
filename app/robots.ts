import type { MetadataRoute } from "next";

const SITE = "https://tableandbell.com";

/** Marketing pages may be indexed; restaurant, guest and staff pages may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/privacy", "/terms"],
      disallow: ["/dashboard", "/r/", "/t/", "/invite/", "/admin", "/api/", "/kitchen-display", "/reset-password", "/auth/"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
