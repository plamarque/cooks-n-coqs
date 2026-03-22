/** Nombre d’ingrédients au-delà du plafond d’icônes visibles (0 si pas de dépassement). */
export function stepIngredientOverflowCount(total: number, maxVisible = 3): number {
  if (total <= maxVisible) return 0;
  return total - maxVisible;
}
