import { create } from 'zustand';
import { ITEM_BY_ID, coinBalance, type ItemSlot } from '../items';
import {
  purchaseItem as fsPurchaseItem,
  setEquippedItem as fsSetEquippedItem,
} from '../firestore';
import { useAuthStore } from './authStore';
import { useLevelStore } from './levelStore';

interface InventoryState {
  coinsSpent: number;
  ownedItems: string[];
  equippedHat: string | null;
  equippedAccessory: string | null;
  pendingError: string | null;

  applyServerUpdate: (data: {
    coinsSpent: number;
    ownedItems: string[];
    equippedHat: string | null;
    equippedAccessory: string | null;
  }) => void;
  buy: (itemId: string) => Promise<void>;
  equip: (itemId: string) => Promise<void>;
  unequip: (slot: ItemSlot) => Promise<void>;
  clearError: () => void;
}

let syncing = false;

function sync(payload: Partial<InventoryState>) {
  if (syncing) return;
  window.electronAPI?.syncState('inventory', payload);
}

function slotField(slot: ItemSlot): 'equippedHat' | 'equippedAccessory' {
  return slot === 'hat' ? 'equippedHat' : 'equippedAccessory';
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  coinsSpent: 0,
  ownedItems: [],
  equippedHat: null,
  equippedAccessory: null,
  pendingError: null,

  applyServerUpdate: ({ coinsSpent, ownedItems, equippedHat, equippedAccessory }) => {
    const payload = { coinsSpent, ownedItems, equippedHat, equippedAccessory };
    set(payload);
    sync(payload);
  },

  buy: async (itemId) => {
    const item = ITEM_BY_ID[itemId];
    const uid = useAuthStore.getState().user?.uid;
    if (!item || !uid) return;
    const state = get();
    if (state.ownedItems.includes(itemId)) return;
    const balance = coinBalance(
      useLevelStore.getState().totalFocusSec,
      state.coinsSpent,
    );
    if (balance < item.price) {
      set({ pendingError: '코인이 부족합니다.' });
      sync({ pendingError: '코인이 부족합니다.' });
      return;
    }
    // Optimistic — Firestore subscription will reconcile if the write fails.
    const optimistic = {
      coinsSpent: state.coinsSpent + item.price,
      ownedItems: [...state.ownedItems, itemId],
    };
    set(optimistic);
    sync(optimistic);
    try {
      await fsPurchaseItem(uid, itemId, item.price);
    } catch (err) {
      const msg = (err as Error).message ?? '구매에 실패했습니다.';
      set({ pendingError: msg });
      sync({ pendingError: msg });
    }
  },

  equip: async (itemId) => {
    const item = ITEM_BY_ID[itemId];
    const uid = useAuthStore.getState().user?.uid;
    if (!item || !uid) return;
    if (!get().ownedItems.includes(itemId)) return;
    const field = slotField(item.slot);
    const patch = { [field]: itemId } as Pick<InventoryState, typeof field>;
    set(patch);
    sync(patch);
    try {
      await fsSetEquippedItem(uid, item.slot, itemId);
    } catch (err) {
      const msg = (err as Error).message ?? '착용에 실패했습니다.';
      set({ pendingError: msg });
      sync({ pendingError: msg });
    }
  },

  unequip: async (slot) => {
    const uid = useAuthStore.getState().user?.uid;
    if (!uid) return;
    const field = slotField(slot);
    const patch = { [field]: null } as Pick<InventoryState, typeof field>;
    set(patch);
    sync(patch);
    try {
      await fsSetEquippedItem(uid, slot, null);
    } catch (err) {
      const msg = (err as Error).message ?? '해제에 실패했습니다.';
      set({ pendingError: msg });
      sync({ pendingError: msg });
    }
  },

  clearError: () => {
    set({ pendingError: null });
    sync({ pendingError: null });
  },
}));

if (typeof window !== 'undefined') {
  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'inventory') return;
    syncing = true;
    useInventoryStore.setState(payload as Partial<InventoryState>);
    syncing = false;
  });
}
