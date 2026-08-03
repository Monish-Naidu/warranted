import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @warranted/shared is a workspace symlink to raw TypeScript source, so it
    // has to be transformed rather than treated as a prebuilt dependency.
    server: {
      deps: {
        inline: [/@warranted\//],
      },
    },
  },
});
