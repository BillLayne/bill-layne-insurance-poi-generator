const IMG = "https://img.billlayneinsurance.com";

export const AGENCY = {
  name: "Bill Layne Insurance Agency",
  address: "1283 N Bridge St",
  city: "Elkin, NC 28621",
  phone: "336-835-1993",
  email: "Save@BillLayneInsurance.com",
  website: "www.BillLayneInsurance.com",
  license: "NC Agency License #15569731",
  // Same badge the Speedee quote pages and emails use, served from the agency image host.
  logo: `${IMG}/cdn-cgi/image/width=640,format=auto,quality=90/i/2026/08/bli-agency-logo-4jqj2j.png`,
  agentName: "Bill Layne",
  tagline: "Protecting What Matters"
};

// White-background carrier logos from the agency image host (the Speedee set).
// Hagerty and NC Grange have no own-hosted copy yet, so they keep their old links.
export const CARRIER_LOGOS: Record<string, string> = {
  "Hagerty":          "https://i.imgur.com/0UyINHi.png",
  "Alamance Farmers": `${IMG}/i/2026/11/alamance-farmers-logo-white-bg-rr2rqh.png`,
  "Alamance":         `${IMG}/i/2026/11/alamance-farmers-logo-white-bg-rr2rqh.png`, // Alias for safety
  "NC Grange":        "https://i.imgur.com/Fesnkng.png",
  "Travelers":        `${IMG}/i/2026/11/travelers-logo-white-bg-97hekp.png`,
  "Progressive":      `${IMG}/i/2026/11/progressive-logo-white-bg-jnt93f.png`,
  "National General": `${IMG}/i/2026/11/national-general-logo-white-bg-rq634g.png`,
  "Nationwide":       `${IMG}/i/2026/11/nationwide-logo-white-bg-v8e8qq.png`,
  "NCJUA":            `${IMG}/i/2026/11/ncjua-logo-white-bg-nn9d3d.png`,
  "Dairyland":        `${IMG}/i/2026/11/quote-carrier-dairyland-zeshb2.png`,
  "Foremost":         `${IMG}/i/2026/08/foremost-logo-eh5sta.jpg`,
  "Tower Hill":       `${IMG}/i/2026/11/tower-hill-insurance-logo-white-bg-gy2av4.png`
};

// These logos are a symbol with no company name in it, so the letter prints the name beside them.
export const CARRIER_LOGO_NEEDS_NAME = ["Nationwide", "NCJUA"];

export const AGENT_IDS: Record<string, string> = {
  "Progressive":     "0M295",
  "Nationwide":      "67893",
  "National General":"9018575"
};
