export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return resolve(new URL(`../src/${specifier.slice(2)}`, import.meta.url).href, context, nextResolve)
  }
  if (specifier.startsWith('file:') && !/\.[cm]?[jt]s$/.test(new URL(specifier).pathname)) {
    return nextResolve(`${specifier}.ts`, context)
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]s$/.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context)
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (error && error.code === 'ERR_MODULE_NOT_FOUND' && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.js`, context)
    }
    throw error
  }
}
