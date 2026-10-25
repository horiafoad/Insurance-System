// مُحمّل اختبارات صغير: يضيف امتداد .js للمسارات النسبية بدون امتداد (نمط Vite).
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    return {
      format: "json",
      source: await readFile(fileURLToPath(url), "utf8"),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
