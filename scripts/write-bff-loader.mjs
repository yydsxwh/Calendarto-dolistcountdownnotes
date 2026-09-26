import { writeFileSync } from 'node:fs'

// xlsx 在 ESM bundle 里会变成不支持的动态 require("stream")。
// 正式进程仍由 systemd 启动 index.mjs，这里再转进 CommonJS bundle。
writeFileSync(
  new URL('../server/dist/index.mjs', import.meta.url),
  "import { createRequire } from 'node:module'\nconst require = createRequire(import.meta.url)\nrequire('./index.cjs')\n",
)
