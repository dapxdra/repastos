import { createNeonAuth } from "@neon/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  // SameSite=Lax explícito: el navegador no envía la sesión en POST iniciados desde otros sitios (CSRF)
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET!, sameSite: "lax" },
});
