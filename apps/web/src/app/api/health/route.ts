// Liveness for the container healthcheck, and the answer to "which build is
// orchid serving?". INGENIUM_BUILD_SHA is baked into the image at build time
// (see apps/web/Dockerfile); anywhere else it reads "dev".
//
// Route handlers are not cached by default, so this reads the env per request.

export function GET() {
  return Response.json({
    ok: true,
    version: process.env.INGENIUM_BUILD_SHA ?? "dev",
  });
}
