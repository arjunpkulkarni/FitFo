import { NextResponse } from "next/server";

import {
  APPLE_TEAM_ID,
  IOS_BUNDLE_ID,
  OPEN_APP_WEB_PATH,
} from "@/lib/siteUrls";

/**
 * Apple Universal Links association file — must stay `application/json` and MUST
 * not redirect. Host this on the exact origin you list in Xcode `applinks:`.
 *
 * https://developer.apple.com/documentation/xcode/supporting-associated-domains
 */
export async function GET() {
  const appId = `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`;
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          paths: [OPEN_APP_WEB_PATH, `${OPEN_APP_WEB_PATH}/*`],
        },
      ],
    },
  };

  const res = NextResponse.json(body);
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
