import { useLevelStore } from '@shared/store/levelStore';
import { useInventoryStore } from '@shared/store/inventoryStore';
import {
  ITEMS,
  SLOT_LABEL,
  coinBalance,
  type ItemDef,
  type ItemSlot,
} from '@shared/items';

interface ItemTileProps {
  item: ItemDef;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  onClick: () => void;
}

function ItemTile({ item, owned, equipped, canAfford, onClick }: ItemTileProps) {
  // Tile state machine: not-owned (price) → owned (equip) → equipped (unequip).
  // Clicking does the next sensible thing for the current state.
  const tone = equipped
    ? 'border-blue-500 bg-blue-50'
    : owned
      ? 'border-emerald-400 bg-emerald-50'
      : canAfford
        ? 'border-gray-300 hover:bg-gray-50'
        : 'border-gray-200 bg-gray-50 opacity-60';

  const footer = equipped
    ? '착용중 (해제)'
    : owned
      ? '착용'
      : `${item.price} 코인`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!owned && !canAfford}
      className={`flex flex-col items-center gap-1 p-3 border-2 rounded-lg transition disabled:cursor-not-allowed ${tone}`}
    >
      <div className="text-3xl leading-none">{item.emoji}</div>
      <div className="text-xs font-medium">{item.name}</div>
      <div className="text-[11px] text-gray-600">{footer}</div>
    </button>
  );
}

interface SlotSectionProps {
  slot: ItemSlot;
  ownedItems: string[];
  equippedId: string | null;
  balance: number;
  onTileClick: (item: ItemDef) => void;
}

function SlotSection({ slot, ownedItems, equippedId, balance, onTileClick }: SlotSectionProps) {
  const slotItems = ITEMS.filter((i) => i.slot === slot);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">{SLOT_LABEL[slot]}</h3>
      <div className="grid grid-cols-3 gap-2">
        {slotItems.map((item) => (
          <ItemTile
            key={item.id}
            item={item}
            owned={ownedItems.includes(item.id)}
            equipped={equippedId === item.id}
            canAfford={balance >= item.price}
            onClick={() => onTileClick(item)}
          />
        ))}
      </div>
    </div>
  );
}

export default function CustomizePanel() {
  const totalFocusSec = useLevelStore((s) => s.totalFocusSec);
  const coinsSpent = useInventoryStore((s) => s.coinsSpent);
  const ownedItems = useInventoryStore((s) => s.ownedItems);
  const equippedHat = useInventoryStore((s) => s.equippedHat);
  const equippedAccessory = useInventoryStore((s) => s.equippedAccessory);
  const error = useInventoryStore((s) => s.pendingError);
  const clearError = useInventoryStore((s) => s.clearError);
  const buy = useInventoryStore((s) => s.buy);
  const equip = useInventoryStore((s) => s.equip);
  const unequip = useInventoryStore((s) => s.unequip);

  const balance = coinBalance(totalFocusSec, coinsSpent);

  const handleTileClick = (item: ItemDef) => {
    clearError();
    const owned = ownedItems.includes(item.id);
    const equippedId = item.slot === 'hat' ? equippedHat : equippedAccessory;
    if (!owned) {
      void buy(item.id);
    } else if (equippedId === item.id) {
      void unequip(item.slot);
    } else {
      void equip(item.id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none">💰</span>
          <span className="font-medium">{balance.toLocaleString()} 코인</span>
        </div>
        <span className="text-xs text-amber-700">10분 집중 = 1코인</span>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 px-3 py-2 bg-red-50 border border-red-300 text-red-700 rounded text-sm">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="text-red-500 hover:text-red-700">
            닫기
          </button>
        </div>
      )}

      <SlotSection
        slot="hat"
        ownedItems={ownedItems}
        equippedId={equippedHat}
        balance={balance}
        onTileClick={handleTileClick}
      />
      <SlotSection
        slot="accessory"
        ownedItems={ownedItems}
        equippedId={equippedAccessory}
        balance={balance}
        onTileClick={handleTileClick}
      />
    </div>
  );
}
