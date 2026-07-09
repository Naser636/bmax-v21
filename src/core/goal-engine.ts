import { Goal } from "@/contracts/goal";

export function getDefaultGoal(): Goal {
  return {
    id: crypto.randomUUID(),
    name: "Créer de la valeur économique",
    description:
      "Transformer des informations en opportunités et en résultats économiques démontrables.",
    createdAt: Date.now(),
  };
}
