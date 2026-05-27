export type WorkItemIdentity = {
  id: string
  sourceKey: string
  externalId: string
}

export function isSameWorkItem(left: WorkItemIdentity | null | undefined, right: WorkItemIdentity | null | undefined) {
  if (!left || !right) {
    return false
  }

  return left.id === right.id || (left.sourceKey === right.sourceKey && left.externalId === right.externalId)
}

export function detailMatchesSelection(
  detail: WorkItemIdentity | null | undefined,
  selectedId: string | null,
  selectedListItem: WorkItemIdentity | null | undefined,
) {
  if (!detail || !selectedId) {
    return false
  }

  return detail.id === selectedId || isSameWorkItem(detail, selectedListItem)
}

export function shouldApplyDetailResponse(
  responseRequestId: number,
  latestRequestId: number,
  requestedItem: WorkItemIdentity,
  detail: WorkItemIdentity,
  selectedId: string | null,
) {
  return (
    responseRequestId === latestRequestId &&
    selectedId !== null &&
    (requestedItem.id === selectedId || detail.id === selectedId) &&
    isSameWorkItem(requestedItem, detail)
  )
}

export function replaceMatchingItemWithDetail<TItem extends WorkItemIdentity>(items: TItem[], detail: TItem) {
  return items.map((item) => (isSameWorkItem(item, detail) ? { ...detail, id: item.id } : item))
}
