// Lets Node run this repo's TypeScript directly (tests, one-off scripts).
// Node strips types natively but, unlike the Next bundler, will not resolve
// extensionless imports such as `from "./config"`. This hook adds that.
//
//   node --import ./scripts/register-ts.mjs some-file.ts
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

registerHooks({
    resolve(specifier, context, nextResolve) {
        const isPath = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");

        if (isPath && context.parentURL?.startsWith("file:")) {
            const url = new URL(specifier, context.parentURL);
            const path = fileURLToPath(url);

            if (!(existsSync(path) && statSync(path).isFile())) {
                for (const suffix of CANDIDATES) {
                    if (existsSync(path + suffix)) {
                        return nextResolve(url.href + suffix, context);
                    }
                }
            }
        }

        return nextResolve(specifier, context);
    },
});
