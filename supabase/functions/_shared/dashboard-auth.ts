import { createAdminClient } from "./config.ts";
import { readBearerToken, sha256 } from "./http.ts";

export async function authorizeDashboardRequest(request: Request): Promise<boolean> {
  const candidate = readBearerToken(request);
  if (!candidate || candidate.length < 32 || candidate.length > 512) return false;

  const tokenHash = await sha256(candidate);
  const { data, error } = await createAdminClient().rpc(
    "verify_dashboard_token_secure",
    { p_token_hash: tokenHash },
  );
  return !error && data === true;
}
