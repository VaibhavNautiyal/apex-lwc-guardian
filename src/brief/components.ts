/** Groups changed files into the components a release manager recognises. */
export interface ChangedComponents {
  apexClasses: {name: string; path: string}[]
  triggers: {name: string; path: string}[]
  lwc: {name: string; files: string[]}[]
}

export function groupComponents(files: readonly string[]): ChangedComponents {
  const apexClasses: ChangedComponents['apexClasses'] = []
  const triggers: ChangedComponents['triggers'] = []
  const lwc = new Map<string, string[]>()
  for (const path of [...files].sort()) {
    const base = path.split('/').at(-1) ?? path
    if (/\.cls$/i.test(base)) apexClasses.push({name: base.replace(/\.cls$/i, ''), path})
    else if (/\.trigger$/i.test(base)) triggers.push({name: base.replace(/\.trigger$/i, ''), path})
    else {
      const m = /(?:^|\/)lwc\/([^/]+)\//.exec(path)
      if (m) lwc.set(m[1], [...(lwc.get(m[1]) ?? []), path])
    }
  }
  return {
    apexClasses,
    triggers,
    lwc: [...lwc].map(([name, componentFiles]) => ({name, files: componentFiles})),
  }
}
