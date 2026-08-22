export interface TypeMenuOption {
  title: string
  type: string
  checked: boolean
}

export function buildTypeMenuOptions(types: string[], currentType: string): TypeMenuOption[] {
  const ordered = types.includes(currentType) ? types : [currentType, ...types]
  return [...new Set(ordered)].map((type) => ({
    title: type,
    type,
    checked: type === currentType,
  }))
}
