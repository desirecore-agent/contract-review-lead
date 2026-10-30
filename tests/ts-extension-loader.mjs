import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Explicit platform-only preflight loader. Default member tests do not load platform code.
// Resolve aliases from the selected platform's actual tsconfig, not a copied alias table.
let aliasConfig
async function aliases() {
  const root = process.env.CONTRACT_PLATFORM_SOURCE
  if (!root || !path.isAbsolute(root)) throw new Error('CONTRACT_PLATFORM_SOURCE must be an absolute platform checkout')
  aliasConfig ??= readFile(path.join(root, 'tsconfig.json'), 'utf8').then(JSON.parse)
  return { root, paths: (await aliasConfig).compilerOptions?.paths ?? {} }
}

async function existingFile(url) {
  try { return (await stat(url)).isFile() } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

export async function resolve(specifier, context, nextResolve) {
  const candidates = []
  if (specifier.startsWith('@desirecore/')) {
    const { root, paths } = await aliases()
    for (const [pattern, replacements] of Object.entries(paths)) {
      const star = pattern.indexOf('*')
      const matched = star < 0 ? specifier === pattern : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
      if (!matched) continue
      const capture = star < 0 ? '' : specifier.slice(star, specifier.length - (pattern.length - star - 1))
      for (const replacement of replacements) {
        candidates.push(pathToFileURL(path.resolve(root, replacement.replace('*', capture))))
      }
    }
  } else if (/^\.{1,2}\//.test(specifier) && !/\.[^/]+$/.test(specifier)) {
    candidates.push(new URL(specifier, context.parentURL))
  }
  for (const base of candidates) {
    for (const suffix of ['', '.ts', '/index.ts']) {
      const candidate = new URL(base.href + suffix)
      if (await existingFile(candidate)) return nextResolve(candidate.href, context)
    }
  }
  return nextResolve(specifier, context)
}
