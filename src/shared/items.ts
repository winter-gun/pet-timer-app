export type ItemSlot = 'hat' | 'accessory';

export interface ItemDef {
  id: string;
  name: string;
  emoji: string;
  slot: ItemSlot;
  price: number;
}

// Item IDs are persisted to Firestore — never rename existing entries; only
// add new ones. Emoji prices roughly track perceived rarity within the slot.
export const ITEMS: ItemDef[] = [
  { id: 'graduation_cap', name: '졸업모',  emoji: '🎓', slot: 'hat',       price: 30  },
  { id: 'fedora',         name: '중절모',  emoji: '🎩', slot: 'hat',       price: 60  },
  { id: 'crown',          name: '왕관',    emoji: '👑', slot: 'hat',       price: 150 },
  { id: 'ribbon',         name: '리본',    emoji: '🎀', slot: 'accessory', price: 20  },
  { id: 'star',           name: '별',      emoji: '⭐', slot: 'accessory', price: 50  },
  { id: 'gem',            name: '보석',    emoji: '💎', slot: 'accessory', price: 120 },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i]),
);

export const SEC_PER_COIN = 600;

export function coinsEarned(totalFocusSec: number): number {
  return Math.floor(Math.max(0, totalFocusSec) / SEC_PER_COIN);
}

export function coinBalance(totalFocusSec: number, coinsSpent: number): number {
  return Math.max(0, coinsEarned(totalFocusSec) - Math.max(0, coinsSpent));
}

export const SLOT_LABEL: Record<ItemSlot, string> = {
  hat: '모자',
  accessory: '액세서리',
};
