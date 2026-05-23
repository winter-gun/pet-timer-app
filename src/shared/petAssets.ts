import type { PetSpecies, PetPose } from './types';

// Vite bundles every matching PNG and gives us a URL. Keys are paths
// relative to this file.
const images = import.meta.glob<{ default: string }>(
  '../../assets/pets/*/*.png',
  { eager: true },
);

export function getPetImage(species: PetSpecies, pose: PetPose): string {
  const key = `../../assets/pets/${species}/${pose}.png`;
  return images[key]?.default ?? '';
}
