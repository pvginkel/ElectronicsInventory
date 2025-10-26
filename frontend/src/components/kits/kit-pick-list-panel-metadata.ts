import type { KitDetail, KitPickListSummary } from '@/types/kits';

function getLatestUpdatedAt(pickLists: KitPickListSummary[]): string | null {
  let latest = Number.NEGATIVE_INFINITY;

  for (const pickList of pickLists) {
    const parsed = Date.parse(pickList.updatedAt);
    if (!Number.isNaN(parsed) && parsed > latest) {
      latest = parsed;
    }
  }

  return Number.isFinite(latest) && latest > 0 ? new Date(latest).toISOString() : null;
}

export function buildKitPickListPanelMetadata(kit: KitDetail) {
  const openPickLists = kit.pickLists.filter((item) => item.status === 'open');
  const completedPickLists = kit.pickLists.filter((item) => item.status === 'completed');

  return {
    kitId: kit.id,
    openCount: openPickLists.length,
    completedCount: completedPickLists.length,
    hasOpenWork: openPickLists.length > 0,
    latestUpdatedAt: getLatestUpdatedAt(kit.pickLists),
  };
}
