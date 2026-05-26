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

const STORE_KEY_COINS_SPENT = 'inventory.coinsSpent';
const STORE_KEY_OWNED = 'inventory.ownedItems';
const STORE_KEY_HAT = 'inventory.equippedHat';
const STORE_KEY_ACC = 'inventory.equippedAccessory';

let syncing = false;

function sync(payload: Partial<InventoryState>) {
  if (syncing) return;
  window.electronAPI?.syncState('inventory', payload);
}

function persist(state: Partial<InventoryState>) {
  const api = window.electronAPI;
  if (!api) return;
  if ('coinsSpent' in state && typeof state.coinsSpent === 'number') {
    void api.storeSet(STORE_KEY_COINS_SPENT, state.coinsSpent);
  }
  if ('ownedItems' in state && Array.isArray(state.ownedItems)) {
    void api.storeSet(STORE_KEY_OWNED, state.ownedItems);
  }
  if ('equippedHat' in state) {
    void api.storeSet(STORE_KEY_HAT, state.equippedHat ?? null);
  }
  if ('equippedAccessory' in state) {
    void api.storeSet(STORE_KEY_ACC, state.equippedAccessory ?? null);
  }
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
    // Merge with local state so offline purchases aren't lost on sign-in
    // before they're pushed up. coinsSpent uses max() (matches the
    // max-merge used for totalFocusSec); ownedItems union-merges; equip
    // slot uses server value only if local is empty.
    const prev = get();
    const mergedOwned = Array.from(new Set([...prev.ownedItems, ...ownedItems]));
    const payload = {
      coinsSpent: Math.max(prev.coinsSpent, coinsSpent),
      ownedItems: mergedOwned,
      equippedHat: prev.equippedHat ?? equippedHat,
      equippedAccessory: prev.equippedAccessory ?? equippedAccessory,
    };
    set(payload);
    persist(payload);
    sync(payload);
  },

  buy: async (itemId) => {
    const item = ITEM_BY_ID[itemId];
    if (!item) return;
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
    // Optimistic local update — works fully offline. Firestore (if signed
    // in) will reconcile via applyServerUpdate's union/max merge.
    const optimistic = {
      coinsSpent: state.coinsSpent + item.price,
      ownedItems: [...state.ownedItems, itemId],
    };
    set(optimistic);
    persist(optimistic);
    sync(optimistic);

    const uid = useAuthStore.getState().user?.uid;
    if (!uid) return;
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
    if (!item) return;
    if (!get().ownedItems.includes(itemId)) return;
    const field = slotField(item.slot);
    const patch = { [field]: itemId } as Pick<InventoryState, typeof field>;
    set(patch);
    persist(patch);
    sync(patch);

    const uid = useAuthStore.getState().user?.uid;
    if (!uid) return;
    try {
      await fsSetEquippedItem(uid, item.slot, itemId);
    } catch (err) {
      const msg = (err as Error).message ?? '착용에 실패했습니다.';
      set({ pendingError: msg });
      sync({ pendingError: msg });
    }
  },

  unequip: async (slot) => {
    const field = slotField(slot);
    const patch = { [field]: null } as Pick<InventoryState, typeof field>;
    set(patch);
    persist(patch);
    sync(patch);

    const uid = useAuthStore.getState().user?.uid;
    if (!uid) return;
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

async function initFromStore() {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  const api = window.electronAPI;
  const [coinsSpent, owned, hat, acc] = await Promise.all([
    api.storeGet<number>(STORE_KEY_COINS_SPENT),
    api.storeGet<string[]>(STORE_KEY_OWNED),
    api.storeGet<string | null>(STORE_KEY_HAT),
    api.storeGet<string | null>(STORE_KEY_ACC),
  ]);
  const patch: Partial<InventoryState> = {};
  if (typeof coinsSpent === 'number' && coinsSpent > 0) patch.coinsSpent = coinsSpent;
  if (Array.isArray(owned)) {
    patch.ownedItems = owned.filter((x): x is string => typeof x === 'string');
  }
  if (typeof hat === 'string') patch.equippedHat = hat;
  if (typeof acc === 'string') patch.equippedAccessory = acc;
  if (Object.keys(patch).length > 0) {
    useInventoryStore.setState(patch);
  }
}

if (typeof window !== 'undefined') {
  void initFromStore();

  window.electronAPI?.onStateBroadcast((channel, payload) => {
    if (channel !== 'inventory') return;
    syncing = true;
    useInventoryStore.setState(payload as Partial<InventoryState>);
    syncing = false;
  });
}
