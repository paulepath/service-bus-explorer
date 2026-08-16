import { QueueSummary, TopicSummary } from '../../core/models/service-bus.models';

export interface TreeNode<T> {
  name: string;
  fullPath: string;
  isFolder: boolean;
  item?: T;
  children: TreeNode<T>[];
  totalActiveCount?: number;
  totalDlqCount?: number;
}

export function buildHierarchicalTree<T extends { name: string; counts?: { activeMessageCount: number; deadLetterMessageCount: number } }>(
  items: T[]
): TreeNode<T>[] {
  const rootNodes: TreeNode<T>[] = [];

  for (const item of items) {
    // Split by either forward slash / or backslash \
    const rawSegments = item.name.split(/[/\\]/).filter(s => s.trim().length > 0);
    const segments = rawSegments.length > 0 ? rawSegments : [item.name];

    let currentList = rootNodes;
    let accumulatedPath = '';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${seg}` : seg;
      const isLeaf = (i === segments.length - 1);

      let existing = currentList.find(n => n.name === seg);
      if (!existing) {
        existing = {
          name: seg,
          fullPath: accumulatedPath,
          isFolder: !isLeaf,
          item: isLeaf ? item : undefined,
          children: []
        };
        currentList.push(existing);
      } else if (isLeaf && !existing.item) {
        existing.item = item;
      }

      currentList = existing.children;
    }
  }

  function sortAndAggregate(nodes: TreeNode<T>[]) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        sortAndAggregate(node.children);
      }
      let active = node.item?.counts?.activeMessageCount || 0;
      let dlq = node.item?.counts?.deadLetterMessageCount || 0;
      for (const child of node.children) {
        active += child.totalActiveCount || 0;
        dlq += child.totalDlqCount || 0;
      }
      node.totalActiveCount = active;
      node.totalDlqCount = dlq;
    }

    nodes.sort((a, b) => {
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1; // Folders first
      }
      return a.name.localeCompare(b.name);
    });
  }

  sortAndAggregate(rootNodes);
  return rootNodes;
}
